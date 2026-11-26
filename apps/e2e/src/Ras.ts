import * as Config from "effect/Config"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Ref from "effect/Ref"
import * as Schedule from "effect/Schedule"
import * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as ApiTesting from "@ras/api/testing"
import * as MemoryTesting from "@ras/memory/testing"

export const owner = { email: "owner@e2e.test", password: "e2e-owner-password" } as const

export const webhookSecret = "ras-e2e-webhook-secret"

export const schedulerAccount = "ras-scheduler@ras-e2e.iam.gserviceaccount.com"

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
 * A scratch directory for a ras on `port`: a fresh database holding the owner, an empty memory repository, the sample
 * calendars and mailbox, and a local bucket its backups go to, so no test reaches an outside service. Closing the scope
 * deletes the directory.
 */
const prepare = (port: number) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const url = new URL(`http://localhost:${port}`)
    const s3 = yield* ApiTesting.localS3

    const scratch = yield* fs.makeTempDirectoryScoped({ prefix: "ras-e2e-" })
    const memory = path.join(scratch, "memory")
    yield* fs.makeDirectory(memory)
    yield* run("git", ["init", "--quiet", "--initial-branch", "master"], { cwd: memory })
    yield* run("git", ["config", "user.name", "e2e"], { cwd: memory })
    yield* run("git", ["config", "user.email", "e2e@e2e.test"], { cwd: memory })
    yield* fs.writeFileString(path.join(memory, "registry.yaml"), MemoryTesting.registry)
    yield* run("git", ["add", "registry.yaml"], { cwd: memory })
    yield* run("git", ["commit", "--quiet", "-m", "init"], { cwd: memory })

    const database = path.join(scratch, "ras.db")
    const options: ChildProcess.CommandOptions = {
      cwd: api,
      extendEnv: true,
      env: {
        RAS_URL: url.origin,
        RAS_PORT: String(port),
        RAS_DATABASE: database,
        RAS_MEMORY_PATH: memory,
        RAS_AUTH_SECRET: "ras-e2e-auth-secret-not-for-production",
        RAS_MEMORY_WEBHOOK_SECRET: webhookSecret,
        RAS_BACKUP_SCHEDULER_ACCOUNT: schedulerAccount,
        ...ApiTesting.settings(s3.bucket),
        RAS_SAMPLE: "true"
      }
    }
    const setOwner = run("bun", ["src/main.ts", "owner", "--email", owner.email, "--password", owner.password], options)
    yield* setOwner
    return { url, database, bucket: s3.bucket, options, setOwner }
  })

/** Runs `ras serve` until the scope closes, once `/health` answers. */
const start = (url: URL, options: ChildProcess.CommandOptions) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    yield* spawner.spawn(
      ChildProcess.make("bun", ["src/main.ts", "serve"], { ...options, stdout: "ignore", stderr: "inherit" })
    )
    yield* HttpClient.get(new URL("/health", url)).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.retry(Schedule.spaced(Duration.millis(200))),
      Effect.timeout(Duration.seconds(30)),
      Effect.orDie
    )
  })

/** A ras of its own on `RAS_E2E_PORT`, stopped and deleted when the scope closes. */
export const serve = Effect.gen(function* () {
  const port = yield* Config.Port("RAS_E2E_PORT").pipe(Config.withDefault(4240))
  const prepared = yield* prepare(port)
  yield* start(prepared.url, prepared.options)
  return { url: prepared.url, bucket: prepared.bucket }
})

/**
 * A ras of its own on `port` that a test stops and starts again, as Cloud Run does. `restart` keeps the database, and
 * `replace` starts on a new database holding only the owner, as a start that lost every write would.
 */
export const restartable = (port: number) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const prepared = yield* prepare(port)
    const startIn = (scope: Scope.Closeable) => start(prepared.url, prepared.options).pipe(Scope.provide(scope))
    const first = yield* Scope.make()
    const current = yield* Ref.make(first)
    const stop = Effect.flatMap(Ref.get(current), (scope) => Scope.close(scope, Exit.void))
    yield* Effect.addFinalizer(() => stop)
    yield* startIn(first)

    const startAgain = Effect.gen(function* () {
      const scope = yield* Scope.make()
      yield* Ref.set(current, scope)
      yield* startIn(scope)
    })

    const restart = Effect.orDie(Effect.andThen(stop, startAgain))
    const replace = stop.pipe(
      Effect.andThen(
        Effect.forEach(["", "-wal", "-shm"], (suffix) => fs.remove(`${prepared.database}${suffix}`, { force: true }))
      ),
      Effect.andThen(prepared.setOwner),
      Effect.andThen(startAgain),
      Effect.orDie
    )
    return { url: prepared.url, database: prepared.database, restart, replace }
  })
