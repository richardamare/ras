import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder"
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint"
import * as HttpApiGroup from "effect/http-api/HttpApiGroup"
import * as Global from "@ras/global"
import * as Errors from "@ras/kernel/Errors"
import * as Calendars from "./calendars/Calendars.ts"
import * as Busy from "./calendars/Busy.ts"
import * as Calendar from "./calendars/Calendar.ts"
import * as Insights from "./calendars/Insights.ts"
import * as Span from "./calendars/Span.ts"
import * as WorkHours from "./calendars/WorkHours.ts"
import * as Event from "./events/Event.ts"
import * as EventWrites from "./events/EventWrites.ts"
import * as Events from "./events/Events.ts"

const failures = [Errors.Refused, Errors.NotFound, Errors.Invalid, Errors.SourceFailed]

const calendarId = Schema.NumberFromString.pipe(Schema.decodeTo(Calendar.CalendarId))

const listOf = <A>(value: A | ReadonlyArray<A> | undefined): ReadonlyArray<A> =>
  value === undefined ? [] : Arr.ensure(value)

export const group = HttpApiGroup.make("calendar")
  .add(
    HttpApiEndpoint.get("calendars", "/calendars", {
      query: { includeDisabled: Schema.optionalKey(Schema.Literals(["true", "false"])) },
      success: Schema.Array(Calendar.Calendar),
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.patch("changeCalendar", "/calendars/:id", {
      params: { id: calendarId },
      payload: Calendar.CalendarChange,
      success: Calendar.Calendar,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.get("events", "/events", {
      query: Span.Window.fields,
      success: Schema.Array(Event.Event),
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.get("event", "/events/:id", {
      params: { id: Event.EventId },
      success: Event.Event,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.get("freeTime", "/free-time", {
      query: { ...Span.Window.fields, minimum: Schema.NumberFromString.pipe(Schema.decodeTo(Schema.Int)) },
      success: Schema.Array(Busy.Slot),
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.get("conflicts", "/conflicts", {
      query: Span.Window.fields,
      success: Schema.Array(Busy.Conflict),
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.get("workHours", "/work-hours/:month", {
      params: { month: WorkHours.Month },
      query: {
        category: Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
        calendar: Schema.optionalKey(Schema.Union([calendarId, Schema.Array(calendarId)]))
      },
      success: WorkHours.WorkHours,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.get("insights", "/insights", {
      query: {
        ...Insights.Period.fields,
        calendar: Schema.optionalKey(Schema.Union([calendarId, Schema.Array(calendarId)])).annotate({
          description: "The calendars to count; without it, every shown calendar counts."
        })
      },
      success: Insights.Insights,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.post("createEvent", "/events", {
      payload: EventWrites.NewEvent,
      success: EventWrites.Created,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.patch("changeEvent", "/events/:id", {
      params: { id: Event.EventId },
      payload: EventWrites.EventChange,
      success: Event.Event,
      error: failures
    })
  )
  .add(HttpApiEndpoint.delete("cancelEvent", "/events/:id", { params: { id: Event.EventId }, error: failures }))
  .add(
    HttpApiEndpoint.post("replyToEvent", "/events/:id/reply", {
      params: { id: Event.EventId },
      payload: Schema.Struct({ reply: EventWrites.Reply }),
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.post("confirmDraft", "/events/:id/confirm", {
      params: { id: Event.EventId },
      success: EventWrites.Created,
      error: failures
    })
  )
  .prefix("/calendar")

export const handlers = HttpApiBuilder.group(Global.api(group), "calendar", (endpoints) =>
  Effect.gen(function* () {
    const calendar = yield* Calendars.Calendar
    const events = yield* Events.Events
    return endpoints
      .handle("calendars", ({ query }) => calendar.calendars(query.includeDisabled === "true"))
      .handle("changeCalendar", ({ params, payload }) => calendar.changeCalendar(params.id, payload))
      .handle("events", ({ query }) => calendar.events(query))
      .handle("event", ({ params }) => calendar.event(params.id))
      .handle("freeTime", ({ query: { minimum, ...window } }) => calendar.freeTime(window, minimum))
      .handle("conflicts", ({ query }) => calendar.conflicts(query))
      .handle("workHours", ({ params, query }) =>
        calendar.workHours(params.month, listOf(query.category), listOf(query.calendar))
      )
      .handle("insights", ({ query: { calendar: chosen, ...period } }) => calendar.insights(period, listOf(chosen)))
      .handle("createEvent", ({ payload }) => events.create(payload))
      .handle("changeEvent", ({ params, payload }) => events.change(params.id, payload))
      .handle("cancelEvent", ({ params }) => events.cancel(params.id))
      .handle("replyToEvent", ({ params, payload }) => events.reply(params.id, payload.reply))
      .handle("confirmDraft", ({ params }) => events.confirm(params.id))
  })
)
