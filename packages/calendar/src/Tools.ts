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
  }),
  Global.read("find_free_time", {
    description:
      "The free slots of at least `minimum` minutes in a window, across every calendar ras shows. An event shown as free or declined leaves its time free.",
    parameters: Schema.Struct({
      ...WindowParameters.fields,
      minimum: Schema.Int.check(Schema.isGreaterThanOrEqualTo(5)).annotate({ description: "Minutes; at least 5." })
    }),
    success: Schema.Array(Domain.Slot)
  }),
  Global.read("find_conflicts", {
    description:
      "The pairs of events that take the same time in a window, each with the overlap and the fixes the calendar rules allow for either.",
    parameters: WindowParameters,
    success: Schema.Array(Domain.Conflict)
  }),
  Global.read("work_hours", {
    description:
      "The time a month's events take, in total, by category and per day. Overlapping events count once; all-day, free and declined events do not count.",
    parameters: Schema.Struct({
      month: Domain.Month.annotate({ description: "The Prague month, such as 2026-10." }),
      categories: Schema.optionalKey(Schema.Array(Schema.String)).annotate({
        description: "Only these categories, such as WORK; every category when omitted."
      })
    }),
    success: Domain.WorkHours
  })
)

export const handlers = toolkit.toLayer(
  Effect.gen(function* () {
    const calendar = yield* Calendar.Calendar
    return {
      list_calendars: () => calendar.calendars(false),
      search_calendar: (window) => calendar.events(window),
      calendar_event: ({ event }) => calendar.event(event),
      find_free_time: ({ minimum, ...window }) => calendar.freeTime(window, minimum),
      find_conflicts: (window) => calendar.conflicts(window),
      work_hours: ({ month, categories }) => calendar.workHours(month, categories ?? [])
    }
  })
)
