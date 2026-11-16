import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"

/**
 * Where ras lives on the host. `releases/<tag>` holds one installed release each, `current` and `previous` are links
 * to two of them, and `source` is the clone the releases come from. The database and the memory clone sit beside
 * them, so no release owns them.
 */
export const make = Effect.gen(function* () {
  const path = yield* Path.Path
  const home = yield* Config.String("HOME")
  const state = yield* Config.String("RAS_HOME").pipe(
    Config.withDefault(path.join(home, "Library", "Application Support", "ras"))
  )
  return {
    state,
    source: path.join(state, "source"),
    releases: path.join(state, "releases"),
    release: (tag: string) => path.join(state, "releases", tag),
    current: path.join(state, "current"),
    previous: path.join(state, "previous"),
    failed: path.join(state, "failed"),
    lock: path.join(state, "deploy.lock"),
    logs: path.join(home, "Library", "Logs", "ras"),
    launchAgents: path.join(home, "Library", "LaunchAgents")
  }
})

export type Layout = Effect.Success<typeof make>
