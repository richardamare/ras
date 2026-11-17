import * as Config from "effect/Config"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Schedule from "effect/Schedule"
import * as Stream from "effect/Stream"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"

export const owner = { email: "owner@e2e.test", password: "e2e-owner-password" } as const

const api = new URL("../../api", import.meta.url).pathname

/** Runs a command to its end, failing with its output when it exits non-zero. */
const run = (command: string, args: ReadonlyArray<string>, options: ChildProcess.CommandOptions) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const handle = yield* spawner.spawn(ChildProcess.make(command, args, options))
      const [output, code] = yield* Effect.all([Stream.mkString(Stream.decodeText(handle.all)), handle.exitCode], {
        concurrency: 2
      })
      if (Number(code) !== 0) return yield* Effect.die(new Error(`${command} ${args.join(" ")}: ${output}`))
    })
  )

/**
 * A ras of its own in a scratch directory, on `RAS_E2E_PORT`: a fresh database holding the owner, an empty memory
 * repository, and the sample calendars and mailbox, so no test reaches an outside service. Closing the scope stops it
 * and deletes the directory.
 */
export const serve = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const port = yield* Config.Port("RAS_E2E_PORT").pipe(Config.withDefault(4240))
  const url = new URL(`http://localhost:${port}`)

  const scratch = yield* fs.makeTempDirectoryScoped({ prefix: "ras-e2e-" })
  const memory = path.join(scratch, "memory")
  yield* fs.makeDirectory(memory)
  yield* run("git", ["init", "--quiet", "--initial-branch", "master"], { cwd: memory })
  yield* run("git", ["config", "user.name", "e2e"], { cwd: memory })
  yield* run("git", ["config", "user.email", "e2e@e2e.test"], { cwd: memory })
  yield* run("git", ["commit", "--quiet", "--allow-empty", "-m", "init"], { cwd: memory })

  const options: ChildProcess.CommandOptions = {
    cwd: api,
    extendEnv: true,
    env: {
      RAS_URL: url.origin,
      RAS_PORT: String(port),
      RAS_DATABASE: path.join(scratch, "ras.db"),
      RAS_MEMORY_PATH: memory,
      RAS_AUTH_SECRET: "ras-e2e-auth-secret-not-for-production",
      RAS_SAMPLE: "true"
    }
  }
  yield* run("bun", ["src/main.ts", "owner", "--email", owner.email, "--password", owner.password], options)
  yield* spawner.spawn(
    ChildProcess.make("bun", ["src/main.ts", "serve"], { ...options, stdout: "ignore", stderr: "inherit" })
  )

  yield* HttpClient.get(new URL("/health", url)).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.retry(Schedule.spaced(Duration.millis(200))),
    Effect.timeout(Duration.seconds(30)),
    Effect.orDie
  )
  return url
})
