import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"

/** A step of a deploy that could not finish; `reason` is what the operator reads. */
export class Failed extends Data.TaggedError("Failed")<{ readonly reason: string }> {}

export class Shell extends Context.Service<
  Shell,
  {
    /** Runs a command and answers its exit code and its output, stdout and stderr together. */
    readonly exec: (
      command: string,
      args: ReadonlyArray<string>,
      cwd?: string
    ) => Effect.Effect<{ readonly code: number; readonly output: string }, Failed>
  }
>()("@ras/ctl/Shell") {
  static readonly layer = Layer.effect(
    Shell,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      return Shell.of({
        exec: (command, args, cwd) =>
          Effect.scoped(
            Effect.gen(function* () {
              const handle = yield* spawner.spawn(ChildProcess.make(command, args, cwd === undefined ? {} : { cwd }))
              const [output, code] = yield* Effect.all(
                [Stream.mkString(Stream.decodeText(handle.all)), handle.exitCode],
                { concurrency: 2 }
              )
              return { code: Number(code), output: output.trim() }
            })
          ).pipe(Effect.mapError((error) => new Failed({ reason: `${command} did not run: ${error.message}` })))
      })
    })
  )
}

/** Runs a command that must succeed and answers its output. */
export const run = (command: string, args: ReadonlyArray<string>, cwd?: string) =>
  Effect.flatMap(
    Shell.use((shell) => shell.exec(command, args, cwd)),
    ({ code, output }) =>
      code === 0
        ? Effect.succeed(output)
        : Effect.fail(new Failed({ reason: `${command} ${args.join(" ")} exited with ${code}: ${output}` }))
  )

/** Runs a command and answers whether it succeeded. */
export const succeeds = (command: string, args: ReadonlyArray<string>, cwd?: string) =>
  Effect.map(
    Shell.use((shell) => shell.exec(command, args, cwd)),
    ({ code }) => code === 0
  )
