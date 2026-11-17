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
  .prefix("/calendar")

export const handlers = HttpApiBuilder.group(Global.api(group), "calendar", (endpoints) =>
  Effect.gen(function* () {
    const calendar = yield* Calendar.Calendar
    return endpoints
      .handle("calendars", ({ query }) => calendar.calendars(query.includeDisabled === "true"))
      .handle("changeCalendar", ({ params, payload }) => calendar.changeCalendar(params.id, payload))
      .handle("events", ({ query }) => calendar.events(query))
      .handle("event", ({ params }) => calendar.event(params.id))
  })
)
