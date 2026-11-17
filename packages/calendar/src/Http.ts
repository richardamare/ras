import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder"
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint"
import * as HttpApiGroup from "effect/http-api/HttpApiGroup"
import * as Global from "@ras/global"
import * as Errors from "@ras/kernel/Errors"
import * as Calendar from "./Calendar.ts"
import * as Domain from "./Domain.ts"

const failures = [Errors.NotFound, Errors.Invalid, Errors.SourceFailed]

export const group = HttpApiGroup.make("calendar")
  .add(
    HttpApiEndpoint.get("calendars", "/calendars", {
      query: { includeDisabled: Schema.optionalKey(Schema.Literals(["true", "false"])) },
      success: Schema.Array(Domain.Calendar),
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.patch("changeCalendar", "/calendars/:id", {
      params: { id: Schema.NumberFromString.pipe(Schema.decodeTo(Domain.CalendarId)) },
      payload: Domain.CalendarChange,
      success: Domain.Calendar,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.get("events", "/events", {
      query: Domain.Window.fields,
      success: Schema.Array(Domain.Event),
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.get("event", "/events/:id", {
      params: { id: Domain.EventId },
      success: Domain.Event,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.get("freeTime", "/free-time", {
      query: { ...Domain.Window.fields, minimum: Schema.NumberFromString.pipe(Schema.decodeTo(Schema.Int)) },
      success: Schema.Array(Domain.Slot),
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.get("conflicts", "/conflicts", {
      query: Domain.Window.fields,
      success: Schema.Array(Domain.Conflict),
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.get("workHours", "/work-hours/:month", {
      params: { month: Domain.Month },
      query: { category: Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)])) },
      success: Domain.WorkHours,
      error: failures
    })
  )
  .prefix("/calendar")

export const handlers = HttpApiBuilder.group(Global.api(group), "calendar", (endpoints) =>
  Effect.gen(function* () {
    const calendar = yield* Calendar.Calendar
    return endpoints
      .handle("calendars", ({ query }) => calendar.calendars(query.includeDisabled === "true"))
      .handle("changeCalendar", ({ params, payload }) => calendar.changeCalendar(params.id, payload))
      .handle("events", ({ query }) => calendar.events(query))
      .handle("event", ({ params }) => calendar.event(params.id))
      .handle("freeTime", ({ query: { minimum, ...window } }) => calendar.freeTime(window, minimum))
      .handle("conflicts", ({ query }) => calendar.conflicts(query))
      .handle("workHours", ({ params, query }) =>
        calendar.workHours(params.month, query.category === undefined ? [] : [query.category].flat())
      )
  })
)
