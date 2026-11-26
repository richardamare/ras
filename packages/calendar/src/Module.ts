import * as Layer from "effect/Layer"
import * as Module from "@ras/kernel/Module"
import * as KernelSample from "@ras/kernel/Sample"
import * as Calendars from "./calendars/Calendars.ts"
import * as CalendarRepository from "./calendars/CalendarRepository.ts"
import * as DraftRepository from "./calendars/DraftRepository.ts"
import * as EventCacheRepository from "./calendars/EventCacheRepository.ts"
import * as Events from "./events/Events.ts"
import * as Http from "./Http.ts"
import * as Migrations from "./Migrations.ts"
import * as GoogleCalendar from "./google/GoogleCalendar.ts"
import * as GoogleConnection from "./google/Connection.ts"
import * as Outlook from "./outlook/Outlook.ts"
import * as OutlookConnection from "./outlook/Connection.ts"
import * as Reclaim from "./reclaim/Reclaim.ts"
import * as ReclaimConnection from "./reclaim/Connection.ts"
import * as Sample from "./reclaim/Sample.ts"
import * as Tools from "./Tools.ts"

/** Reclaim, Outlook and Google, or in sample mode the invented calendars and an Outlook and a Google that write nowhere. */
const sources = KernelSample.choose({
  sample: Layer.mergeAll(Sample.layer, Outlook.sample, GoogleCalendar.sample),
  live: Layer.mergeAll(Reclaim.live, Outlook.live, GoogleCalendar.live)
})

const repositories = Layer.mergeAll(
  CalendarRepository.CalendarRepository.layer,
  EventCacheRepository.EventCacheRepository.layer,
  DraftRepository.DraftRepository.layer
)

export const module = Module.make({
  name: "calendar",
  migrations: Migrations.migrations,
  services: Events.Events.layer.pipe(
    Layer.provideMerge(Calendars.Calendar.layer),
    Layer.provide(repositories),
    Layer.provideMerge(sources)
  ),
  http: { group: Http.group, handlers: Http.handlers },
  tools: { toolkit: Tools.toolkit, handlers: Tools.handlers },
  connections: [OutlookConnection.outlook, GoogleConnection.google, ReclaimConnection.reclaim]
})
