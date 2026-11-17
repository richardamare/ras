import * as Arr from "effect/Array"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Stream from "effect/Stream"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Errors from "@ras/kernel/Errors"

/** A Markdown file the clone tracks, by its path from the repository's root, as read from disk. */
export interface File {
  readonly path: string
  readonly content: string
}

const failed = (reason: string) => new Errors.SourceFailed({ source: "git", reason })

const filesystem = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.mapError(effect, (error) => failed(`The clone could not be read: ${String(error)}`))

/**
 * The memory repository checked out on the host. Pulls and pushes go to the branch's upstream; a clone without one
 * is a local repository, whose commits stay on the host.
 */
export class Clone extends Context.Service<
  Clone,
  {
    readonly pull: Effect.Effect<void, Errors.SourceFailed>
    readonly files: Effect.Effect<ReadonlyArray<File>, Errors.SourceFailed>
    /** The file at `path` from the repository's root, whether git tracks it or not. */
    readonly read: (path: string) => Effect.Effect<Option.Option<string>, Errors.SourceFailed>
    /** Writes `content` to `path`, making its folders, or removes it when `content` is none, and commits that one file under the identity the clone is configured with. */
    readonly commit: (change: {
      readonly path: string
      readonly content: Option.Option<string>
      readonly message: string
    }) => Effect.Effect<void, Errors.SourceFailed>
    /** Pushes the commits; `false` when the remote rejected them because it moved on. */
    readonly push: Effect.Effect<boolean, Errors.SourceFailed>
    /** Drops the last commit and puts its file back as it was before it. */
    readonly undo: Effect.Effect<void, Errors.SourceFailed>
    /** Where pulls and pushes go, without any credentials in its URL; none for a local repository. */
    readonly upstream: Option.Option<string>
    /** Lists the upstream's branches, the cheapest call that proves the remote answers and takes the credentials. */
    readonly reach: Effect.Effect<void, Errors.SourceFailed>
  }
>()("@ras/memory/Clone") {
  static readonly make = (directory: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

      const run = (args: ReadonlyArray<string>) =>
        Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* spawner.spawn(ChildProcess.make("git", args, { cwd: directory }))
            const [output, code] = yield* Effect.all(
              [Stream.mkString(Stream.decodeText(handle.all)), handle.exitCode],
              { concurrency: 2 }
            )
            return { output: output.trim(), code: Number(code) }
          })
        ).pipe(Effect.mapError((error) => failed(`git ${args[0]} did not run: ${error.message}`)))

      const git = (...args: ReadonlyArray<string>) =>
        Effect.flatMap(run(args), ({ output, code }) =>
          code === 0 ? Effect.succeed(output) : Effect.fail(failed(`git ${args.join(" ")} failed: ${output}`))
        )

      const root = yield* git("rev-parse", "--show-toplevel").pipe(
        Effect.mapError(() => failed(`${directory} is not a git repository.`))
      )
      const branch = yield* run(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
      const tracked = branch.code === 0
      const remote = branch.output.split("/")[0] ?? ""
      const upstream = tracked
        ? Option.some((yield* git("remote", "get-url", remote)).replace(/\/\/[^@/]+@/, "//"))
        : Option.none<string>()

      const read = (file: string) =>
        filesystem(
          Effect.gen(function* () {
            const at = path.join(root, file)
            return (yield* fs.exists(at)) ? Option.some(yield* fs.readFileString(at)) : Option.none<string>()
          })
        )

      return Clone.of({
        pull: tracked ? Effect.asVoid(git("pull", "--ff-only", "--quiet")) : Effect.void,
        files: Effect.gen(function* () {
          const listed = Arr.filter(
            (yield* git("ls-files", "-z")).split("\0"),
            (file) => file.endsWith(".md") && !file.split("/").some((part) => part.startsWith("."))
          )
          return yield* filesystem(
            Effect.forEach(listed, (file) =>
              Effect.map(fs.readFileString(path.join(root, file)), (content) => ({ path: file, content }))
            )
          )
        }),
        read: (file) => read(file),
        commit: ({ path: file, content, message }) =>
          Effect.gen(function* () {
            const at = path.join(root, file)
            yield* Option.match(content, {
              onNone: () => filesystem(fs.remove(at)),
              onSome: (text) =>
                filesystem(
                  Effect.andThen(fs.makeDirectory(path.dirname(at), { recursive: true }), fs.writeFileString(at, text))
                )
            })
            yield* git("add", "--all", "--", file)
            yield* git("commit", "--quiet", "--no-verify", "--message", message, "--", file)
          }),
        push: tracked
          ? Effect.flatMap(run(["push", "--quiet"]), ({ output, code }) =>
              code === 0
                ? Effect.succeed(true)
                : /rejected|fetch first|non-fast-forward/.test(output)
                  ? Effect.succeed(false)
                  : Effect.fail(failed(`git push failed: ${output}`))
            )
          : Effect.succeed(true),
        undo: Effect.asVoid(git("reset", "--quiet", "--keep", "HEAD~1")),
        upstream,
        reach: tracked ? Effect.asVoid(git("ls-remote", "--quiet", "--heads", remote)) : Effect.void
      })
    })

  /** The clone at `RAS_MEMORY_PATH`. */
  static readonly layer = Layer.effect(
    Clone,
    Effect.flatMap(Config.String("RAS_MEMORY_PATH"), Clone.make).pipe(Effect.orDie)
  )
}
