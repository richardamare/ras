import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Connections from "@ras/kernel/Connections"
import * as Reclaim from "./Reclaim.ts"

export const reclaim = Effect.gen(function* () {
  const reclaim = yield* Reclaim.Reclaim
  const apiKey = yield* Config.option(Config.Redacted("RAS_RECLAIM_API_KEY")).pipe(Effect.orDie)
  return yield* Connections.source(
    "reclaim",
    Effect.succeed(
      Option.isSome(apiKey)
        ? Connections.connected("reclaim")
        : Connections.notConfigured("reclaim", "ras has no Reclaim API key. Set RAS_RECLAIM_API_KEY.")
    ),
    reclaim.calendars
  )
})
