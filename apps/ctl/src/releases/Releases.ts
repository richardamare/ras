import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import * as Shell from "../shell/Shell.ts"

/** Written last into a release, so a half-installed folder has none. */
export const marker = "release"

const fail = (reason: string) => (error: unknown) => new Shell.Failed({ reason: `${reason}: ${String(error)}` })

/** The release folder a link points to, if the link exists. */
export const target = (link: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    return yield* fs.readLink(link).pipe(
      Effect.map((to) => Option.some(path.resolve(path.dirname(link), to))),
      Effect.orElseSucceed(() => Option.none<string>())
    )
  })

/** The tag of a complete release. */
export const tag = (release: Option.Option<string>) =>
  Effect.gen(function* () {
    if (Option.isNone(release)) return Option.none<string>()
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    return yield* fs.readFileString(path.join(release.value, marker)).pipe(
      Effect.map((text) => Option.some(text.trim())),
      Effect.orElseSucceed(() => Option.none<string>())
    )
  })

/** The tag the link points at, if it points at a complete release. */
export const tagAt = (link: string) => Effect.flatMap(target(link), tag)

/** Points `link` at `release` with one rename, so a reader never sees the link missing. */
export const point = (link: string, release: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const staged = `${link}.next`
    yield* fs.remove(staged, { force: true })
    yield* fs.symlink(release, staged)
    yield* fs.rename(staged, link)
  }).pipe(Effect.mapError(fail(`${link} could not point at ${release}`)))

/** Every release but the linked ones and the newest `keep`, oldest last. */
export const expired = (
  releases: ReadonlyArray<{ readonly path: string; readonly created: number }>,
  linked: ReadonlyArray<string>,
  keep = 3
): ReadonlyArray<string> =>
  Arr.sort(
    releases,
    Order.mapInput(Order.flip(Order.Number), (release: { readonly created: number }) => release.created)
  )
    .slice(keep)
    .map((release) => release.path)
    .filter((path) => !linked.includes(path))
