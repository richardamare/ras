import * as BunServices from "@effect/platform-bun/BunServices"
import { assert, describe, it, layer } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as SqlClient from "effect/sql/SqlClient"
import * as TestClock from "effect/testing/TestClock"
import * as Global from "@ras/global"
import * as Testing from "@ras/global/testing"
import * as Fact from "../src/Fact.ts"
import * as Memory from "../src/Memory.ts"
import * as Module from "../src/Module.ts"
import * as MemoryTesting from "../src/Testing.ts"

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

const draft = (name: string, text: string): Fact.Draft => ({
  name: Fact.Name.make(name),
  description: `About ${name}`,
  type: "preference",
  text
})

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
    yield* fs.writeFileString(path.join(owner, file), content)
    yield* run(owner, "add", "--all")
    yield* run(owner, "commit", "--quiet", "--message", `owner: ${file}`)
    yield* run(owner, "push", "--quiet")
  })

const kalendarnik = Global.AgentSlug.make("kalendarnik")

const refusal = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.map(Effect.flip(effect), (error) => ("code" in error ? String(error.code) : error._tag))

describe("Fact", () => {
  it("reads a fact whose frontmatter names its file", () => {
    const content = Fact.render(draft("coffee-order", "Flat white, oat milk."))
    const parsed = Fact.parse("coffee-order.md", content)
    assert.isTrue(parsed._tag === "Success")
    if (parsed._tag === "Success") {
      assert.strictEqual(parsed.success.text, "Flat white, oat milk.")
      assert.strictEqual(parsed.success.version, Fact.version(content))
    }
  })

  it("reports a file whose frontmatter names another file", () => {
    const parsed = Fact.parse("tea.md", Fact.render(draft("coffee-order", "x")))
    assert.isTrue(parsed._tag === "Failure")
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
      yield* (yield* Global.Agents).add(kalendarnik, "Kalendářník")
      const actingAs = yield* Global.actingAs
      const written = yield* memory
        .write(draft("coffee-order", "Flat white, oat milk."), Option.none())
        .pipe(actingAs(kalendarnik))
      assert.strictEqual(
        yield* git(remote, "log", "-1", "--format=%an <%ae>|%s", "master"),
        "kalendarnik <kalendarnik@agents.ras.invalid>|memory(kalendarnik): coffee-order"
      )
      const read = yield* memory.read(["coffee-order", "nothing"])
      assert.strictEqual(read.facts[0]?.version, written.version)
      assert.deepStrictEqual(read.missing, ["nothing"])
      assert.deepStrictEqual(
        (yield* memory.index).facts.map((entry) => entry.name),
        ["coffee-order"]
      )
      assert.deepStrictEqual(
        (yield* memory.search("oat", 10)).map((hit) => hit.name),
        ["coffee-order"]
      )
      const sql = yield* SqlClient.SqlClient
      const audit = yield* sql<{ action: string; agent: string }>`SELECT action, agent FROM global_audit_entries`
      assert.deepStrictEqual(
        audit.map((row) => [row.action, row.agent]),
        [
          ["global.agent.added", null],
          ["memory.fact.written", "kalendarnik"]
        ]
      )
    })
  )

  test.effect("returns a fact the owner pushed once the last pull is a minute old", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory
      yield* ownerPushes("standup.md", Fact.render(draft("standup", "Standup is at 9:30.")))
      yield* TestClock.adjust("61 seconds")
      const read = yield* memory.read(["standup"])
      assert.strictEqual(read.facts[0]?.text, "Standup is at 9:30.")
      assert.deepStrictEqual(
        (yield* memory.search("standup", 10)).map((hit) => hit.name),
        ["standup"]
      )
    })
  )

  test.effect("refuses a write against a version the owner changed, with the current text", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory
      const read = yield* memory.read(["standup"])
      const stale = read.facts[0]!.version
      yield* ownerPushes("standup.md", Fact.render(draft("standup", "Standup is at 10:00.")))
      const error = yield* Effect.flip(memory.write(draft("standup", "Standup is at 9:45."), Option.some(stale)))
      assert.strictEqual(error._tag === "Refused" ? error.code : error._tag, "memory.fact.changed")
      assert.include(error.reason, "Standup is at 10:00.")
    })
  )

  test.effect("refuses to overwrite a fact without its version, and a fact holding a secret", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory
      assert.strictEqual(yield* refusal(memory.write(draft("standup", "again"), Option.none())), "memory.fact.exists")
      assert.strictEqual(
        yield* refusal(memory.write(draft("github", `token: ghp_${"b".repeat(36)}`), Option.none())),
        "memory.fact.secret"
      )
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
      yield* memory.write(draft("lunch", "Lunch at noon."), Option.none())
      yield* fs.remove(hook)
      const subjects = yield* git(clone, "log", "-3", "--format=%s", "origin/master")
      assert.deepStrictEqual(subjects.split("\n").slice(0, 2), ["memory(owner): lunch", "raced"])
    })
  )

  test.effect("reports a file that is not a valid fact", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory
      yield* TestClock.adjust("61 seconds")
      const index = yield* memory.index
      assert.deepStrictEqual(
        index.invalid.map((file) => file.file),
        ["raced.md"]
      )
    })
  )

  test.effect("deletes a fact given its version", () =>
    Effect.gen(function* () {
      const memory = yield* Memory.Memory
      const { remote } = yield* Repositories
      const read = yield* memory.read(["lunch"])
      yield* memory.remove(Fact.Name.make("lunch"), read.facts[0]!.version)
      assert.deepStrictEqual((yield* memory.read(["lunch"])).missing, ["lunch"])
      assert.strictEqual(yield* git(remote, "ls-tree", "--name-only", "master", "lunch.md"), "")
    })
  )
})
