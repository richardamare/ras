import { assert, describe, it } from "@effect/vitest"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as Registry from "../../src/registry/Registry.ts"

const yaml = `
kinds:
  person:
    path: people/*/*.md
    name: kebab
    write: agents
    required: { description: line }
    optional: { email: line, aliases: list }
  project:
    path: projects/*.md
    name: kebab
    write: agents
    required:
      description: line
      status: [active, paused, done, cancelled]
  bot:
    path: bots/{agent}.md
    write: owner
    required: { description: line }
  sop:
    path: sops/{agent}/*.md
    name: kebab
    write: own
    required: { description: line }
    optional: { review: date }
  task-note:
    path: notes/*.md
    name: dated
    write: own
    required: { description: line, owner: agent }
`

const registry = Result.getOrThrow(Registry.parse(yaml))

const place = (path: string) => Option.getOrThrow(Registry.placeOf(registry, path))

const failure = (content: string) =>
  Result.match(Registry.parse(content), { onFailure: (reason) => reason, onSuccess: () => "" })

describe("Registry", () => {
  it("gives a path the kind of the first pattern that matches it, and the agent its folder names", () => {
    assert.strictEqual(place("people/colleagues/jan-novak.md").kind.name, "person")
    assert.strictEqual(place("projects/ras.md").kind.name, "project")
    const sop = place("sops/kalendarnik/weekly-plan.md")
    assert.deepStrictEqual([sop.kind.name, sop.agent, sop.stem], ["sop", Option.some("kalendarnik"), "weekly-plan"])
    assert.deepStrictEqual(place("bots/kalendarnik.md").agent, Option.some("kalendarnik"))
  })

  it("matches no kind for a path outside every pattern", () => {
    for (const path of ["people/jan-novak.md", "notes.md", "sops/kalendarnik.md", "projects/ras.txt", "registry.yaml"])
      assert.isTrue(Option.isNone(Registry.placeOf(registry, path)), path)
  })

  it("accepts a file that keeps its kind's rules", () => {
    assert.deepStrictEqual(
      Registry.problemsOf(place("projects/ras.md"), { description: "The personal system.", status: "active" }),
      []
    )
  })

  it("names every rule a file breaks", () => {
    assert.deepStrictEqual(Registry.problemsOf(place("projects/Ras.md"), { status: "open", type: "project" }), [
      "The file name `Ras.md` must follow `kebab`, such as `jan-novak.md`.",
      "`description` is required.",
      "`status` must be one of `active`, `paused`, `done`, `cancelled`.",
      "`type` is not a property of project; it takes `description`, `status`."
    ])
    assert.deepStrictEqual(
      Registry.problemsOf(place("sops/kalendarnik/weekly.md"), { description: "x", review: "soon" }),
      ["`review` must be a date, `YYYY-MM-DD`."]
    )
    assert.deepStrictEqual(Registry.problemsOf(place("sops/Kalendarnik/weekly.md"), { description: "x" }), [
      "`Kalendarnik` is not an agent's slug."
    ])
  })

  it("lets the owner write every kind, any agent an `agents` kind, and nobody else an `owner` kind", () => {
    const bot = place("bots/kalendarnik.md")
    assert.isTrue(Registry.mayWrite(bot, {}, Option.none()))
    assert.isFalse(Registry.mayWrite(bot, {}, Option.some("kalendarnik")))
    assert.isTrue(Registry.mayWrite(place("projects/ras.md"), {}, Option.some("mailer")))
  })

  it("lets only the agent a file belongs to write an `own` kind, by its folder or its `owner` property", () => {
    const sop = place("sops/kalendarnik/weekly-plan.md")
    assert.isTrue(Registry.mayWrite(sop, {}, Option.some("kalendarnik")))
    assert.isFalse(Registry.mayWrite(sop, {}, Option.some("mailer")))
    assert.strictEqual(Registry.writers(sop, {}), "Only the owner and kalendarnik write this sop.")
    const note = place("notes/2026-11-17-weekly.md")
    assert.isTrue(Registry.mayWrite(note, { owner: "mailer" }, Option.some("mailer")))
    assert.isFalse(Registry.mayWrite(note, { owner: "mailer" }, Option.some("kalendarnik")))
  })

  it("explains a registry it cannot use", () => {
    assert.include(failure("kinds: ["), "registry.yaml is not valid YAML")
    assert.include(failure("kinds:\n  x: { path: x/*.md, write: anyone }"), "does not hold `kinds` as documented")
    assert.include(
      failure("kinds:\n  x: { path: x/*.md, write: agents, required: { description: line } }"),
      "Kind `x`: its file name is a wildcard, so it needs a `name` rule"
    )
    assert.include(
      failure("kinds:\n  x: { path: x/*.md, name: kebab, write: agents }"),
      "Kind `x`: it must require `description: line`"
    )
    assert.include(
      failure("kinds:\n  x: { path: x/*.md, name: kebab, write: own, required: { description: line } }"),
      "`write: own` needs `{agent}` in the path or a required `owner: agent` property"
    )
    assert.include(
      failure("kinds:\n  x: { path: x/a*.md, name: kebab, write: agents, required: { description: line } }"),
      "mixes a wildcard into a name"
    )
  })
})
