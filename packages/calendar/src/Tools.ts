import * as Schema from "effect/Schema"
import * as Toolkit from "effect/ai/Toolkit"
import * as Effect from "effect/Effect"
import * as Global from "@ras/global"
import * as Calendar from "./Calendar.ts"
import * as Domain from "./Domain.ts"

const WindowParameters = Schema.Struct({
  from: Domain.Window.fields.from.annotate({
    description: "Prague local time the window starts, such as 2026-10-22T08:00."
  }),
  to: Domain.Window.fields.to.annotate({ description: "Prague local time the window ends." })
})

export const toolkit = Toolkit.make(
  Global.read("list_calendars", {
    description:
      "The calendars ras shows, with id, name, colour and role: `personal` takes plain events, `work` only replies, `copy` and `unmarked` nothing.",
    success: Schema.Array(Domain.Calendar)
  }),
  Global.read("search_calendar", {
    description:
      "The events of every calendar ras shows that overlap a window, each once, in start order. Times are Prague local.",
    parameters: WindowParameters,
    success: Schema.Array(Domain.Event)
  }),
  Global.read("calendar_event", {
    description: "One event in full: kind, show-as, reply, location, notes, attendees and the original a copy is of.",
    parameters: Schema.Struct({ event: Domain.EventId.annotate({ description: "The id search_calendar gave." }) }),
    success: Domain.Event
  })
)

export const handlers = toolkit.toLayer(
  Effect.gen(function* () {
    const calendar = yield* Calendar.Calendar
    return {
      list_calendars: () => calendar.calendars(false),
      search_calendar: (window) => calendar.events(window),
      calendar_event: ({ event }) => calendar.event(event)
    }
  })
)
