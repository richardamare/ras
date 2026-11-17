import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Connections from "@ras/kernel/Connections"
import * as Outlook from "./Outlook.ts"

export const outlook = Effect.gen(function* () {
  const outlook = yield* Outlook.Outlook
  return yield* Connections.source(
    "outlook",
    Effect.map(
      outlook.account,
      Option.match({
        onNone: () => Connections.notConfigured("outlook", "No Outlook account is connected to ras yet."),
        onSome: (account) => Connections.connected("outlook", account)
      })
    ),
    outlook.reach
  )
})
