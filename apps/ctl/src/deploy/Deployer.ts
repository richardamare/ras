import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schedule from "effect/Schedule"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as GitHub from "../releases/GitHub.ts"
import * as Launchd from "./Launchd.ts"
import type * as Layout from "./Layout.ts"
import * as Releases from "../releases/Releases.ts"
import * as Shell from "../shell/Shell.ts"

export const health = "http://127.0.0.1:5180/health"

export type Outcome = "UpToDate" | "Skipped" | "Deployed" | "RolledBack"

const filesystem =
  (reason: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.mapError(effect, (error) => new Shell.Failed({ reason: `${reason}: ${String(error)}` }))

/** True once the API answers its health check; a start migrates the database before it answers. */
const healthy = HttpClient.get(health).pipe(
  Effect.flatMap(HttpClientResponse.filterStatusOk),
  Effect.timeout("5 seconds"),
  Effect.retry({ schedule: Schedule.spaced("2 seconds"), times: 60 }),
  Effect.as(true),
  Effect.orElseSucceed(() => false)
)

const startHealthy = (release: string, layout: Layout.Layout) =>
  Launchd.start(Launchd.api, release, layout).pipe(
    Effect.andThen(healthy),
    Effect.catchTag("Failed", (error) =>
      Effect.as(Effect.logError(`The API on ${release} did not start: ${error.reason}`), false)
    )
  )

export const make = (layout: Layout.Layout) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    /** Holds the deploy lock, taking it over from a process that died holding it. */
    const locked = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.acquireUseRelease(
        Effect.gen(function* () {
          yield* fs.makeDirectory(layout.state, { recursive: true })
          const holder = yield* fs.readFileString(layout.lock).pipe(Effect.orElseSucceed(() => ""))
          const alive = holder !== "" && (yield* Shell.succeeds("kill", ["-0", holder]))
          if (alive) return yield* new Shell.Failed({ reason: `Another deploy is running, as process ${holder}.` })
          yield* fs.writeFileString(layout.lock, String(process.pid))
        }).pipe(filesystem("The deploy lock could not be taken")),
        () => effect,
        () => Effect.ignore(fs.remove(layout.lock, { force: true }))
      )

    const syncSource = Effect.gen(function* () {
      if (!(yield* fs.exists(path.join(layout.source, ".git")).pipe(filesystem("The source could not be read")))) {
        yield* Shell.run("git", [
          "clone",
          "--quiet",
          "--no-checkout",
          `https://github.com/${GitHub.repository}.git`,
          layout.source
        ])
      }
      yield* Shell.run("git", ["fetch", "--quiet", "--prune", "--tags", "--force", "origin"], layout.source)
    })

    /**
     * Unpacks the tag into a staging folder, installs its dependencies and builds the console the API serves; renamed
     * into place once complete. The build needs the console's dev dependencies, so the install keeps them.
     */
    const install = (tag: string, release: string) =>
      Effect.gen(function* () {
        const staging = `${release}.staging`
        const archive = `${staging}.tar`
        yield* fs.remove(staging, { recursive: true, force: true })
        yield* fs.remove(release, { recursive: true, force: true })
        yield* fs.makeDirectory(staging, { recursive: true })
        const commit = yield* Shell.run("git", ["rev-parse", `${tag}^{commit}`], layout.source)
        yield* Shell.run("git", ["archive", "--format=tar", `--output=${archive}`, commit], layout.source)
        yield* Shell.run("tar", ["-xf", archive, "-C", staging])
        yield* fs.remove(archive)
        yield* Shell.run("bun", ["install", "--frozen-lockfile", "--ignore-scripts"], staging)
        yield* Shell.run(
          "env",
          ["VITE_ENVIRONMENT=production", `APP_COMMIT=${commit}`, "bun", "run", "build"],
          path.join(staging, "apps", "web")
        )
        yield* fs.writeFileString(path.join(staging, Releases.marker), tag)
        yield* fs.rename(staging, release)
      }).pipe(filesystem(`${tag} could not be installed`))

    /** Points `current` at the release and starts the API on it; when it does not turn healthy, points it back. */
    const activate = (release: string) =>
      Effect.gen(function* () {
        const before = yield* Releases.target(layout.current)
        yield* Releases.point(layout.current, release)
        if (yield* startHealthy(release, layout)) {
          if (Option.isSome(before) && before.value !== release) yield* Releases.point(layout.previous, before.value)
          return true
        }
        if (Option.isNone(before)) {
          yield* Launchd.unload(Launchd.api)
          yield* fs.remove(layout.current, { force: true }).pipe(filesystem("current could not be removed"))
          return yield* new Shell.Failed({
            reason: `The API on ${release} did not turn healthy and there is no release to go back to, so the API is stopped.`
          })
        }
        yield* Effect.logWarning(`The API on ${release} did not turn healthy; going back to ${before.value}.`)
        yield* Releases.point(layout.current, before.value)
        if (!(yield* startHealthy(before.value, layout)))
          yield* Effect.logError("The API is not healthy on the previous release either.")
        return false
      })

    const prune = Effect.gen(function* () {
      const linked = Arr.getSomes([yield* Releases.target(layout.current), yield* Releases.target(layout.previous)])
      const names = yield* fs.readDirectory(layout.releases)
      const releases = yield* Effect.forEach(names, (name) =>
        Effect.map(fs.stat(path.join(layout.releases, name)), (info) => ({
          path: path.join(layout.releases, name),
          created: Option.match(info.birthtime, { onNone: () => 0, onSome: (at) => at.getTime() })
        }))
      )
      yield* Effect.forEach(Releases.expired(releases, linked), (expired) => fs.remove(expired, { recursive: true }), {
        discard: true
      })
    }).pipe(filesystem("Old releases could not be pruned"))

    /**
     * Deploys `tag`, or the latest release. With `skipFailed`, a tag whose deploy failed before is left alone, so the
     * automatic deploy does not reinstall it on every check.
     */
    const deploy = (requested: Option.Option<string>, skipFailed: boolean) =>
      locked(
        Effect.gen(function* () {
          const tag = yield* Option.match(requested, { onNone: () => GitHub.latest, onSome: Effect.succeed })
          if (Option.contains(yield* Releases.tagAt(layout.current), tag)) return "UpToDate" as Outcome
          const failed = yield* fs.readFileString(layout.failed).pipe(Effect.orElseSucceed(() => ""))
          if (skipFailed && failed.trim() === tag) return "Skipped" as Outcome
          yield* Effect.log(`Deploying ${tag}.`)
          const release = layout.release(tag)
          const deployed = yield* Effect.gen(function* () {
            if (!Option.contains(yield* Releases.tag(Option.some(release)), tag)) {
              yield* syncSource
              yield* install(tag, release)
            }
            return yield* activate(release)
          }).pipe(Effect.tapError(() => Effect.ignore(fs.writeFileString(layout.failed, tag))))
          if (!deployed) {
            yield* fs.writeFileString(layout.failed, tag).pipe(filesystem("failed could not be written"))
            return "RolledBack" as Outcome
          }
          yield* fs.remove(layout.failed, { force: true }).pipe(filesystem("failed could not be removed"))
          yield* prune
          yield* Effect.log(`Deployed ${tag}.`)
          return "Deployed" as Outcome
        })
      )

    /** Swaps `current` and `previous` and starts the API on the result. */
    const rollback = locked(
      Effect.gen(function* () {
        const previous = yield* Releases.target(layout.previous)
        const current = yield* Releases.target(layout.current)
        if (Option.isNone(previous)) return yield* new Shell.Failed({ reason: "There is no previous release." })
        yield* Releases.point(layout.current, previous.value)
        if (Option.isSome(current)) yield* Releases.point(layout.previous, current.value)
        if (!(yield* startHealthy(previous.value, layout))) {
          return yield* new Shell.Failed({ reason: `The API on ${previous.value} did not turn healthy.` })
        }
        yield* Effect.log(`Rolled back to ${previous.value}.`)
      })
    )

    return { deploy, rollback }
  })
