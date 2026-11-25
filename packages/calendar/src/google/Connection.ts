import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Connections from "@ras/kernel/Connections"
import * as GoogleCalendar from "./GoogleCalendar.ts"

export const google = Effect.gen(function* () {
  const calendar = yield* GoogleCalendar.GoogleCalendar
  return yield* Connections.source(
    "google",
    Effect.map(
      calendar.account,
      Option.match({
        onNone: () => Connections.notConfigured("google", "No Google account is connected to ras yet."),
        onSome: (account) => Connections.connected("google", account)
      })
    ),
    calendar.reach
  )
})
