import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Connections from "@ras/kernel/Connections"
import * as Mailbox from "./Mailbox.ts"

export const icloud = Effect.gen(function* () {
  const mailbox = yield* Mailbox.Mailbox
  const username = yield* Config.option(Config.String("RAS_MAIL_USERNAME")).pipe(Effect.orDie)
  const password = yield* Config.option(Config.Redacted("RAS_MAIL_APP_PASSWORD")).pipe(Effect.orDie)
  return yield* Connections.source(
    "icloud",
    Effect.succeed(
      Option.isSome(username) && Option.isSome(password)
        ? Connections.connected("icloud", username.value)
        : Connections.notConfigured(
            "icloud",
            "ras has no Apple ID or app-specific password. Set RAS_MAIL_USERNAME and RAS_MAIL_APP_PASSWORD."
          )
    ),
    mailbox.recent({ limit: 1 }).pipe(
      Effect.catchTags({
        NotFound: () => Effect.void,
        Invalid: () => Effect.void
      })
    )
  )
})
