import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Connections from "@ras/kernel/Connections"
import * as Clone from "./Clone.ts"

export const github = Effect.gen(function* () {
  const clone = yield* Clone.Clone
  return yield* Connections.source(
    "github",
    Effect.succeed(
      Option.match(clone.upstream, {
        onNone: () =>
          Connections.notConfigured(
            "github",
            "The memory clone has no upstream, so its commits stay on this host. Clone the memory repository at RAS_MEMORY_PATH."
          ),
        onSome: (url) => Connections.connected("github", url)
      })
    ),
    clone.reach
  )
}).pipe(Effect.provide(Clone.Clone.layer))
