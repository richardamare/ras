import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Connections from "@ras/kernel/Connections"
import * as Mailbox from "./Mailbox.ts"

export const icloud = Effect.gen(function* () {
  const mailbox = yield* Mailbox.Mailbox
  const credentials = yield* Mailbox.credentials
  return yield* Connections.source(
    "icloud",
    Effect.succeed(
      Option.match(credentials, {
        onNone: () => Connections.notConfigured("icloud", Mailbox.unset),
        onSome: ({ username }) => Connections.connected("icloud", username)
      })
    ),
    mailbox.recent({ limit: 1 }).pipe(
      Effect.catchTags({
        NotFound: () => Effect.void,
        Invalid: () => Effect.void
      })
    )
  )
})
