import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import type * as PlatformError from "effect/PlatformError"
import * as Shell from "../shell/Shell.ts"

const alreadyExists = (error: PlatformError.PlatformError) => error.reason._tag === "AlreadyExists"

/**
 * Takes the lock file at `lock` for the process `pid`. The file appears with its holder already in it, through one
 * hard link from a claim file, so a second deploy never reads a lock that is empty or half written. A lock whose
 * process died is taken over.
 */
const take = (lock: string, pid: number) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const claim = `${lock}.${pid}`
    const link = fs.link(claim, lock).pipe(
      Effect.as(true),
      Effect.catchIf(alreadyExists, () => Effect.succeed(false))
    )
    yield* fs.writeFileString(claim, String(pid))
    const taken = yield* Effect.gen(function* () {
      if (yield* link) return true
      const holder = (yield* fs.readFileString(lock).pipe(Effect.orElseSucceed(() => ""))).trim()
      if (holder !== "" && (yield* Shell.succeeds("kill", ["-0", holder])))
        return yield* new Shell.Failed({ reason: `Another deploy is running, as process ${holder}.` })
      yield* fs.remove(lock, { force: true })
      return yield* link
    }).pipe(Effect.ensuring(Effect.ignore(fs.remove(claim, { force: true }))))
    if (!taken) return yield* new Shell.Failed({ reason: "Another deploy took the lock at the same moment." })
  })

/** Runs `effect` holding the lock file at `lock` for the process `pid`, and lets it go after. */
export const held =
  (lock: string, pid: number) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.flatMap(FileSystem.FileSystem, (fs) =>
      Effect.acquireUseRelease(
        take(lock, pid),
        () => effect,
        () => Effect.ignore(fs.remove(lock, { force: true }))
      )
    )
