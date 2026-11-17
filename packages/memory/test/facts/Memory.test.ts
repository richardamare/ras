import * as BunServices from "@effect/platform-bun/BunServices"
import { assert, describe, it, layer } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import * as SqlClient from "effect/sql/SqlClient"
import * as TestClock from "effect/testing/TestClock"
import * as Global from "@ras/global"
import * as Connections from "@ras/kernel/Connections"
import * as Testing from "@ras/global/testing"
import * as Fact from "../../src/facts/Fact.ts"
import * as Memory from "../../src/facts/Memory.ts"
import * as Module from "../../src/Module.ts"
import * as Registry from "../../src/registry/Registry.ts"
import * as MemoryTesting from "../../src/Testing.ts"

class Repositories extends Context.Service<Repositories, Effect.Success<typeof MemoryTesting.repositories>>()(
  "test/Repositories"
) {}

const App = Layer.unwrap(
  Effect.map(MemoryTesting.repositories, (repositories) =>
    Layer.merge(
      Testing.layer([Module.module], { RAS_MEMORY_PATH: repositories.clone }),
      Layer.succeed(Repositories, repositories)
    )
  )
).pipe(Layer.provideMerge(BunServices.layer))

const registry = Result.getOrThrow(Registry.parse(MemoryTesting.registry))

const draft = (path: string, text: string, properties: Fact.Properties = {}): Fact.Draft => ({
  path: Fact.Path.make(path),
  properties: { description: `About ${path}`, ...properties },
  text
})

const fileOf = (one: Fact.Draft) => Fact.render(Option.getOrThrow(Registry.placeOf(registry, one.path)), one)

const git = (cwd: string, ...args: ReadonlyArray<string>) =>
  Effect.promise(() => new Response(Bun.spawn(["git", ...args], { cwd, stdout: "pipe" }).stdout).text()).pipe(
    Effect.map((output) => output.trim())
  )

/** The owner edits a file in their own clone and pushes it, as from an IDE. */
const ownerPushes = (file: string, content: string) =>
  Effect.gen(function* () {
    const { owner, git: run } = yield* Repositories
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* run(owner, "pull", "--quiet", "--ff-only")
    yield* fs.makeDirectory(path.dirname(path.join(owner, file)), { recursive: true })
    yield* fs.writeFileString(path.join(owner, file), content)
    yield* run(owner, "add", "--all")
    yield* run(owner, "commit", "--quiet", "--message", `owner: ${file}`)
    yield* run(owner, "push", "--quiet")
  })

const scheduler = Global.AgentSlug.make("scheduler")
const mailer = Global.AgentSlug.make("mailer")

const refusal = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.map(Effect.flip(effect), (error) => ("code" in error ? String(error.code) : error._tag))

const everything: Memory.Filter = {}

const withRules = `${MemoryTesting.registry}  rule:
    path: rules/*.md
    name: kebab
    write: owner
    required: { description: line }
`

const reason = (path: string, content: string) =>
  Result.match(Fact.parse(registry, path, content), { onFailure: (file) => file.reason, onSuccess: () => "" })

describe("Fact", () => {
  it("reads a file as a fact of the kind its folder gives it", () => {
    const content = fileOf(draft("preferences/coffee-order.md", "Flat white, oat milk."))
    const fact = Result.getOrThrow(Fact.parse(registry, "preferences/coffee-order.md", content))
    assert.deepStrictEqual(
      [fact.kind, fact.description, fact.text],
      ["preference", "About preferences/coffee-order.md", "Flat white, oat milk."]
    )
    assert.strictEqual(fact.version, Fact.version(content))
  })

  it("reports a file no kind matches, and one that breaks its kind's rules", () => {
    assert.strictEqual(
      reason("coffee-order.md", "---\ndescription: x\n---\n"),
      "No kind in registry.yaml matches this path."
    )
    assert.strictEqual(
      reason("preferences/coffee-order.md", "---\ndescription: x\ntype: preference\n---\n"),
      "`type` is not a property of preference; it takes `description`."
    )
    assert.strictEqual(
      reason("preferences/coffee-order.md", "Flat white."),
      "The file does not open with a `---` frontmatter block."
    )
  })

  it("versions a file as git hashes its blob", () =>
    Effect.gen(function* () {
      const hashed = yield* Effect.promise(async () => {
        const run = Bun.spawn(["git", "hash-object", "--stdin"], { stdin: new TextEncoder().encode("Příliš\n") })
        return (await new Response(run.stdout).text()).trim()
      })
      assert.strictEqual(Fact.version("Příliš\n"), hashed)
    }).pipe(Effect.runPromise))

  it("spots a token in a text", () => {
    assert.isTrue(Option.isSome(Fact.secretIn(`use ghp_${"a".repeat(36)}`)))
    assert.isTrue(Option.isNone(Fact.secretIn("The owner takes coffee at nine.")))
  })
})

layer(App)("Memory", (test) => {
  test.effect("commits a write as its agent and serves it to every read", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory
      const { remote } = yield* Repositories
      const agents = yield* Global.Agents
      yield* agents.add(scheduler, "Scheduler")
      yield* agents.add(mailer, "Mailer")
      const actingAs = yield* Global.actingAs
      const written = yield* memory
        .write(draft("preferences/coffee-order.md", "Flat white, oat milk."), Option.none())
        .pipe(actingAs(scheduler))
      assert.strictEqual(written.kind, "preference")
      assert.strictEqual(
        yield* git(remote, "log", "-1", "--format=%an <%ae>|%s", "master"),
        "Owner <owner@example.com>|memory(scheduler): preferences/coffee-order.md"
      )
      const read = yield* memory.read(["preferences/coffee-order.md", "preferences/nothing.md"])
      assert.strictEqual(read.facts[0]?.version, written.version)
      assert.deepStrictEqual(read.missing, ["preferences/nothing.md"])
      const index = yield* memory.index(everything)
      assert.deepStrictEqual(
        index.facts.map((entry) => [entry.path, entry.kind]),
        [["preferences/coffee-order.md", "preference"]]
      )
      assert.deepStrictEqual(
        index.kinds.map((kind) => [kind.kind, kind.path, kind.write]),
        [
          ["preference", "preferences/*.md", "agents"],
          ["person", "people/*/*.md", "agents"],
          ["bot", "bots/{agent}.md", "owner"],
          ["sop", "sops/{agent}/*.md", "own"]
        ]
      )
      assert.isNull(index.registry)
      assert.deepStrictEqual(
        (yield* memory.search("oat", 10)).map((hit) => hit.path),
        ["preferences/coffee-order.md"]
      )
      const sql = yield* SqlClient.SqlClient
      const audit = yield* sql<{
        action: string
        subject: string
      }>`SELECT action, subject FROM global_audit_entries WHERE action LIKE 'memory.%'`
      assert.deepStrictEqual(
        audit.map((row) => [row.action, row.subject]),
        [["memory.fact.written", "memory/preferences/coffee-order.md"]]
      )
    })
  )

  test.effect("returns a fact the owner pushed into a folder once the last pull is a minute old", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory
      yield* ownerPushes(
        "people/colleagues/jan-novak.md",
        fileOf(draft("people/colleagues/jan-novak.md", "Jan runs the standup.", { email: "jan@example.com" }))
      )
      yield* TestClock.adjust("61 seconds")
      const read = yield* memory.read(["people/colleagues/jan-novak.md"])
      assert.deepStrictEqual(read.facts[0]?.properties, {
        description: "About people/colleagues/jan-novak.md",
        email: "jan@example.com"
      })
      assert.deepStrictEqual(
        (yield* memory.search("standup", 10)).map((hit) => [hit.path, hit.kind]),
        [["people/colleagues/jan-novak.md", "person"]]
      )
    })
  )

  test.effect("filters the index by kind and by folder", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory
      const paths = (filter: Memory.Filter) =>
        Effect.map(memory.index(filter), (index) => index.facts.map((entry) => entry.path))
      assert.deepStrictEqual(yield* paths({ kind: "person" }), ["people/colleagues/jan-novak.md"])
      assert.deepStrictEqual(yield* paths({ folder: "people/" }), ["people/colleagues/jan-novak.md"])
      assert.deepStrictEqual(yield* paths({ folder: "people/family" }), [])
    })
  )

  test.effect("refuses a write against a version the owner changed, with the current text", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory
      const path = "people/colleagues/jan-novak.md"
      const stale = (yield* memory.read([path])).facts[0]!.version
      yield* ownerPushes(path, fileOf(draft(path, "Jan runs the standup at 10:00.")))
      const error = yield* Effect.flip(memory.write(draft(path, "Jan runs it at 9:45."), Option.some(stale)))
      assert.strictEqual(error._tag === "Refused" ? error.code : error._tag, "memory.fact.changed")
      assert.include(error.reason, "Jan runs the standup at 10:00.")
    })
  )

  test.effect("refuses to overwrite a fact without its version, and a fact holding a secret", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory
      assert.strictEqual(
        yield* refusal(memory.write(draft("preferences/coffee-order.md", "again"), Option.none())),
        "memory.fact.exists"
      )
      assert.strictEqual(
        yield* refusal(memory.write(draft("preferences/github.md", `token: ghp_${"b".repeat(36)}`), Option.none())),
        "memory.fact.secret"
      )
    })
  )

  test.effect("refuses a path no kind matches, properties its kind does not take, and an agent ras lacks", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory
      assert.strictEqual(yield* refusal(memory.write(draft("notes/x.md", "x"), Option.none())), "memory.path.unknown")
      assert.strictEqual(
        yield* refusal(memory.write(draft("people/jan-novak.md", "x"), Option.none())),
        "memory.path.unknown"
      )
      const invalid = yield* Effect.flip(
        memory.write(draft("sops/scheduler/weekly-plan.md", "x", { status: "open", type: "sop" }), Option.none())
      )
      assert.strictEqual(invalid._tag === "Refused" ? invalid.code : invalid._tag, "memory.fact.invalid")
      assert.include(invalid.reason, "`status` must be one of `draft`, `active`, `retired`.")
      assert.include(invalid.reason, "`type` is not a property of sop")
      assert.strictEqual(
        yield* refusal(memory.write(draft("sops/nobody/weekly-plan.md", "x", { status: "draft" }), Option.none())),
        "memory.agent.unknown"
      )
    })
  )

  test.effect("lets only the owner write a bot's specification, and only the owner and that bot its SOPs", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory
      const actingAs = yield* Global.actingAs
      const sop = draft("sops/scheduler/weekly-plan.md", "Plan the week on Monday.", { status: "active" })
      const written = yield* memory.write(sop, Option.none()).pipe(actingAs(scheduler))
      const forbidden = yield* Effect.flip(memory.write(sop, Option.some(written.version)).pipe(actingAs(mailer)))
      assert.strictEqual(forbidden._tag === "Refused" ? forbidden.code : forbidden._tag, "memory.write.forbidden")
      assert.include(forbidden.reason, "Only the owner and scheduler write this sop.")
      assert.strictEqual(
        yield* refusal(memory.remove(sop.path, written.version).pipe(actingAs(mailer))),
        "memory.write.forbidden"
      )
      const bot = draft("bots/scheduler.md", "Plans the owner's week.")
      assert.strictEqual(
        yield* refusal(memory.write(bot, Option.none()).pipe(actingAs(scheduler))),
        "memory.write.forbidden"
      )
      assert.strictEqual((yield* memory.write(bot, Option.none())).kind, "bot")
    })
  )

  test.effect(
    "takes a kind the owner adds to the registry after the next pull, and keeps it through a broken registry",
    () =>
      Effect.gen(function* () {
        const memory = yield* Memory.Memory
        const rule = draft("rules/no-friday-calls.md", "No calls on Friday afternoon.")
        assert.strictEqual(yield* refusal(memory.write(rule, Option.none())), "memory.path.unknown")
        yield* ownerPushes("registry.yaml", withRules)
        assert.strictEqual((yield* memory.write(rule, Option.none())).kind, "rule")
        yield* ownerPushes("registry.yaml", "kinds: [")
        yield* TestClock.adjust("61 seconds")
        const index = yield* memory.index({ kind: "rule" })
        assert.include(index.registry ?? "", "registry.yaml is not valid YAML")
        assert.deepStrictEqual(
          index.facts.map((entry) => entry.path),
          ["rules/no-friday-calls.md"]
        )
        yield* ownerPushes("registry.yaml", withRules)
      })
  )

  test.effect("pulls and retries once when the remote moved on between the pull and the push", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory
      const { clone, owner } = yield* Repositories
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const marker = path.join(path.dirname(clone), "raced")
      const hook = path.join(clone, ".git", "hooks", "pre-push")
      yield* fs.writeFileString(
        hook,
        `#!/bin/sh\n[ -e "${marker}" ] && exit 0\ntouch "${marker}"\ncd "${owner}" && git pull -q --ff-only && echo raced > raced.md && git add -A && git commit -qm raced && git push -q\n`
      )
      yield* fs.chmod(hook, 0o755)
      yield* memory.write(draft("preferences/lunch.md", "Lunch at noon."), Option.none())
      yield* fs.remove(hook)
      const subjects = yield* git(clone, "log", "-3", "--format=%s", "origin/master")
      assert.deepStrictEqual(subjects.split("\n").slice(0, 2), ["memory(owner): preferences/lunch.md", "raced"])
    })
  )

  test.effect("leaves a file outside the registry out of the index and reports it on read", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory
      yield* TestClock.adjust("61 seconds")
      const index = yield* memory.index(everything)
      assert.deepStrictEqual(index.invalid, [
        { path: "raced.md", reason: "No kind in registry.yaml matches this path." }
      ])
      assert.isFalse(index.facts.some((entry) => entry.path === "raced.md"))
      assert.deepStrictEqual(
        (yield* memory.read(["raced.md"])).invalid.map((file) => file.path),
        ["raced.md"]
      )
    })
  )

  test.effect("deletes a fact given its version", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory
      const { remote } = yield* Repositories
      const path = Fact.Path.make("preferences/lunch.md")
      const read = yield* memory.read([path])
      yield* memory.remove(path, read.facts[0]!.version)
      assert.deepStrictEqual((yield* memory.read([path])).missing, [path])
      assert.strictEqual(yield* git(remote, "ls-tree", "--name-only", "master", path), "")
    })
  )

  test.effect("reports the memory repository connected to its remote, and failing once the remote is gone", () =>
    Effect.gen(function* () {
      const connections = yield* Connections.Connections
      const { remote } = yield* Repositories
      const fs = yield* FileSystem.FileSystem
      const listed = yield* connections.list
      assert.deepStrictEqual(
        listed.map((one) => [one.kind, one.state, one.detail]),
        [["github", "connected", remote]]
      )
      assert.strictEqual((yield* connections.check("github")).state, "connected")
      yield* fs.rename(remote, `${remote}.gone`)
      const checked = yield* connections
        .check("github")
        .pipe(Effect.ensuring(Effect.orDie(fs.rename(`${remote}.gone`, remote))))
      assert.strictEqual(checked.state, "failing")
    })
  )
})
