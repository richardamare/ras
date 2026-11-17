import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"

const git = (cwd: string, ...args: ReadonlyArray<string>) =>
  Effect.promise(async () => {
    const run = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" })
    if ((await run.exited) !== 0) throw new Error(`git ${args.join(" ")}: ${await new Response(run.stderr).text()}`)
  })

/** The registry the test repositories start with: preferences any agent writes, bots only the owner, SOPs their bot. */
export const registry = `kinds:
  preference:
    path: preferences/*.md
    name: kebab
    write: agents
    required: { description: line }
  person:
    path: people/*/*.md
    name: kebab
    write: agents
    required: { description: line }
    optional: { email: line, aliases: list }
  bot:
    path: bots/{agent}.md
    write: owner
    required: { description: line }
  sop:
    path: sops/{agent}/*.md
    name: kebab
    write: own
    required:
      description: line
      status: [draft, active, retired]
`

/**
 * A bare remote and a clone tracking it, in a temporary directory removed with the scope. The clone is where ras
 * works; `owner` is a second clone the owner edits and pushes from, as from an IDE. The first commit holds `registry`.
 */
export const repositories = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "ras-memory-" })
  const remote = path.join(root, "memory.git")
  const clone = path.join(root, "clone")
  const owner = path.join(root, "owner")
  yield* git(root, "init", "--quiet", "--bare", "--initial-branch=master", remote)
  yield* git(root, "clone", "--quiet", remote, owner)
  for (const [key, value] of [
    ["user.name", "Owner"],
    ["user.email", "owner@example.com"],
    ["commit.gpgsign", "false"]
  ] as const)
    yield* git(owner, "config", key, value)
  yield* fs.writeFileString(path.join(owner, "registry.yaml"), registry)
  yield* git(owner, "add", "registry.yaml")
  yield* git(owner, "commit", "--quiet", "--message", "start")
  yield* git(owner, "push", "--quiet", "origin", "master")
  yield* git(root, "clone", "--quiet", remote, clone)
  for (const [key, value] of [
    ["user.name", "Owner"],
    ["user.email", "owner@example.com"],
    ["commit.gpgsign", "false"]
  ] as const)
    yield* git(clone, "config", key, value)
  return { remote, clone, owner, git: (cwd: string, ...args: ReadonlyArray<string>) => git(cwd, ...args) }
})
