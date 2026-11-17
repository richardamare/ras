import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Module from "@ras/kernel/Module"
import * as Mailbox from "./Mailbox.ts"
import * as Tools from "./Tools.ts"

/** iCloud Mail, or with `RAS_SAMPLE` set the invented mailbox. */
const mailbox = Layer.unwrap(
  Effect.map(Config.Boolean("RAS_SAMPLE").pipe(Config.withDefault(false)), (sample) =>
    sample ? Mailbox.sample : Mailbox.live
  ).pipe(Effect.orDie)
)

export const module = Module.make({
  name: "mail",
  services: mailbox,
  tools: { toolkit: Tools.toolkit, handlers: Tools.handlers }
})
