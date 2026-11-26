import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Connections from "@ras/kernel/Connections"
import * as Reclaim from "./Reclaim.ts"

export const reclaim = Effect.gen(function* () {
  const reclaim = yield* Reclaim.Reclaim
  return yield* Connections.source(
    "reclaim",
    Effect.succeed(
      Option.isSome(yield* Reclaim.apiKey)
        ? Connections.connected("reclaim")
        : Connections.notConfigured("reclaim", Reclaim.unset)
    ),
    reclaim.calendars
  )
})
