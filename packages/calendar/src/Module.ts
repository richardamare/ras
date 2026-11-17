import * as Layer from "effect/Layer"
import * as Module from "@ras/kernel/Module"
import * as KernelSample from "@ras/kernel/Sample"
import * as Calendar from "./Calendar.ts"
import * as Events from "./Events.ts"
import * as Http from "./Http.ts"
import * as Migrations from "./Migrations.ts"
import * as Outlook from "./Outlook.ts"
import * as Reclaim from "./Reclaim.ts"
import * as Sample from "./Sample.ts"
import * as Tools from "./Tools.ts"

/** Reclaim and Outlook, or in sample mode the invented calendars and an Outlook that writes nowhere. */
const sources = KernelSample.choose({
  sample: Layer.merge(Sample.layer, Outlook.sample),
  live: Layer.merge(Reclaim.live, Outlook.live)
})

export const module = Module.make({
  name: "calendar",
  migrations: Migrations.migrations,
  services: Events.Events.layer.pipe(Layer.provideMerge(Calendar.Calendar.layer), Layer.provideMerge(sources)),
  http: { group: Http.group, handlers: Http.handlers },
  tools: { toolkit: Tools.toolkit, handlers: Tools.handlers }
})
