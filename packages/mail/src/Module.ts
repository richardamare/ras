import * as Module from "@ras/kernel/Module"
import * as Sample from "@ras/kernel/Sample"
import * as Mailbox from "./mailbox/Mailbox.ts"
import * as Tools from "./Tools.ts"

/** iCloud Mail, or in sample mode the invented mailbox. */
const mailbox = Sample.choose({ sample: Mailbox.sample, live: Mailbox.live })

export const module = Module.make({
  name: "mail",
  services: mailbox,
  tools: { toolkit: Tools.toolkit, handlers: Tools.handlers }
})
