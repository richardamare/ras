import * as Arr from "effect/Array"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Errors from "@ras/kernel/Errors"
import * as Time from "@ras/kernel/Time"
import * as Calendar from "../calendars/Calendar.ts"
import * as Span from "../calendars/Span.ts"
import * as Event from "../events/Event.ts"
import * as EventWrites from "../events/EventWrites.ts"

/** A calendar as Reclaim lists it, with the handles a write to its provider needs. */
export interface SourceCalendar {
  readonly id: Calendar.CalendarId
  readonly name: string
  readonly color: string
  readonly account: number
  /** The email of the account the calendar belongs to. */
  readonly email: string
  readonly providerId: Option.Option<string>
}

/** The calendars Reclaim reaches and their events, as Reclaim holds them; folding copies is the caller's. */
export class Reclaim extends Context.Service<
  Reclaim,
  {
    readonly calendars: Effect.Effect<ReadonlyArray<SourceCalendar>, Errors.SourceFailed>
    /** Every event of every connected calendar that overlaps the Prague days from `first` up to, not including, `end`. */
    readonly events: (
      first: Time.PragueDate,
      end: Time.PragueDate
    ) => Effect.Effect<ReadonlyArray<Event.Entry>, Errors.SourceFailed>
    /** The id the calendar's provider gives the event; for an occurrence of a series, the series' id. */
    readonly providerId: (calendar: SourceCalendar, event: string) => Effect.Effect<string, Errors.SourceFailed>
    /** Answers an invitation and lets its organizer know. */
    readonly reply: (
      calendar: Calendar.CalendarId,
      event: string,
      reply: EventWrites.Reply
    ) => Effect.Effect<void, Errors.SourceFailed>
  }
>()("@ras/calendar/Reclaim") {}

const WireCalendar = Schema.Struct({
  id: Schema.Number,
  credentialId: Schema.Number,
  name: Schema.String,
  connected: Schema.Boolean,
  colorHex: Schema.optional(Schema.NullOr(Schema.String)),
  externalId: Schema.optional(Schema.NullOr(Schema.String))
})

const WireCredential = Schema.Struct({ id: Schema.Number, email: Schema.String })

const WireParticipant = Schema.Struct({
  type: Schema.String,
  email: Schema.optional(Schema.NullOr(Schema.String)),
  displayName: Schema.optional(Schema.NullOr(Schema.String)),
  organizer: Schema.optional(Schema.NullOr(Schema.Boolean)),
  optional: Schema.optional(Schema.NullOr(Schema.Boolean)),
  responseStatus: Schema.optional(Schema.NullOr(Schema.String))
})

/** Reclaim's event as `GET /api/events/v2` sends it; a timed range carries instants, an all-day one dates. */
const WireEvent = Schema.Struct({
  key: Schema.String,
  calendarId: Schema.Number,
  title: Schema.optional(Schema.NullOr(Schema.String)),
  description: Schema.optional(Schema.NullOr(Schema.String)),
  location: Schema.optional(Schema.NullOr(Schema.String)),
  eventDate: Schema.Struct({ type: Schema.String, start: Schema.String, end: Schema.String }),
  status: Schema.String,
  freeBusy: Schema.String,
  rsvpStatus: Schema.optional(Schema.NullOr(Schema.String)),
  selfOrganized: Schema.Boolean,
  canRsvp: Schema.Boolean,
  recurringEventId: Schema.optional(Schema.NullOr(Schema.String)),
  reclaimData: Schema.Struct({
    reclaimEventType: Schema.String,
    eventCategory: Schema.optional(Schema.NullOr(Schema.String)),
    mergeableEvent: Schema.optional(
      Schema.NullOr(Schema.Struct({ calendarId: Schema.Number, eventId: Schema.String, referenceType: Schema.String }))
    )
  }),
  attendeesAndResources: Schema.optional(Schema.NullOr(Schema.Array(WireParticipant)))
})
type WireEvent = typeof WireEvent.Type

const text = (value: string | null | undefined) =>
  Option.filter(Option.fromNullishOr(value), (found) => found.length > 0)

const rsvpOf = (status: string | null | undefined): Event.Rsvp => {
  switch (status) {
    case "ACCEPTED":
      return "accepted"
    case "TENTATIVE":
      return "tentative"
    case "DECLINED":
      return "declined"
    case "NEEDS_ACTION":
      return "needsAction"
    default:
      return "none"
  }
}

const kindOf = (event: WireEvent): Event.Kind => {
  switch (event.reclaimData.reclaimEventType) {
    case "SYNC":
      return "copy"
    case "USER":
      return !event.selfOrganized && event.canRsvp ? "invitation" : "plain"
    default:
      return "reclaim"
  }
}

export const entryOf = (event: WireEvent): Event.Entry => {
  const allDay = event.eventDate.type === "AllDayDateRange"
  const span: Span.Span = allDay
    ? {
        start: Time.pragueMidnight(Time.PragueDate.make(event.eventDate.start)),
        end: Time.pragueMidnight(Time.PragueDate.make(event.eventDate.end))
      }
    : { start: DateTime.makeUnsafe(event.eventDate.start), end: DateTime.makeUnsafe(event.eventDate.end) }
  const date = Time.pragueDateOf(span.start)
  const kind = kindOf(event)
  const original = Option.fromNullishOr(event.reclaimData.mergeableEvent)
  return {
    ref: {
      calendar: Calendar.CalendarId.make(event.calendarId),
      date,
      id: event.key.slice(event.key.indexOf("/") + 1)
    },
    title: Option.getOrElse(text(event.title), () => "(no title)"),
    span,
    allDay,
    kind,
    showAs: event.status === "TENTATIVE" ? "tentative" : event.freeBusy === "FREE" ? "free" : "busy",
    rsvp: rsvpOf(event.rsvpStatus),
    cancelled: event.status === "CANCELLED",
    recurring: event.recurringEventId != null,
    location: text(event.location),
    category: text(event.reclaimData.eventCategory),
    notes: text(event.description),
    attendees: Arr.map(
      Arr.filter(event.attendeesAndResources ?? [], (participant) => participant.type === "EventAttendeeParticipant"),
      (participant) =>
        new Event.Attendee({
          name: participant.displayName ?? null,
          email: participant.email ?? null,
          rsvp: rsvpOf(participant.responseStatus),
          organizer: participant.organizer ?? false,
          optional: participant.optional ?? false
        })
    ),
    copyOf:
      kind === "copy"
        ? Option.flatMap(original, (source) =>
            source.referenceType === "SYNC_EVENT"
              ? Option.some({ calendar: Calendar.CalendarId.make(source.calendarId), date, id: source.eventId })
              : Option.none()
          )
        : Option.none()
  }
}

/** The answers Reclaim's RSVP takes, spelled as it expects them. */
const responses: Record<EventWrites.Reply, string> = {
  accept: "Accepted",
  tentative: "TentativelyAccepted",
  decline: "Declined"
}

const failed = (reason: string) => new Errors.SourceFailed({ source: "reclaim", reason })

/** Reclaim's answer to a refused call, in plain words; the status and body stay in the log. */
const refusal = (status: number) =>
  status === 401 || status === 403
    ? "Reclaim refused ras's API key. Set a current key in RAS_RECLAIM_API_KEY."
    : status === 404
      ? "Reclaim no longer has that event. Search the calendar again."
      : status === 429
        ? "Reclaim is limiting requests. Try again in a minute."
        : status >= 500
          ? "Reclaim is having trouble. Try again in a minute."
          : `Reclaim refused the request (${status}).`

export const make = (apiKey: Redacted.Redacted) =>
  Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest((request) =>
        request.pipe(
          HttpClientRequest.prependUrl("https://api.app.reclaim.ai"),
          HttpClientRequest.bearerToken(Redacted.value(apiKey)),
          HttpClientRequest.acceptJson
        )
      ),
      HttpClient.retryTransient({ times: 3 })
    )

    const send = <S extends Schema.Top>(request: HttpClientRequest.HttpClientRequest, schema: S) => {
      const path = request.url
      return client.execute(request).pipe(
        Effect.flatMap((response) =>
          response.status >= 200 && response.status < 300
            ? HttpClientResponse.schemaBodyJson(schema)(response).pipe(
                Effect.tapError((error) =>
                  Effect.logWarning("Reclaim answered with a body ras cannot read", path, error)
                ),
                Effect.mapError(() => failed("Reclaim answered with something ras cannot read."))
              )
            : Effect.flatMap(response.text, (body) =>
                Effect.logWarning("Reclaim refused", path, response.status, body).pipe(
                  Effect.andThen(Effect.fail(failed(refusal(response.status))))
                )
              ).pipe(Effect.catchTag("HttpClientError", () => Effect.fail(failed(refusal(response.status)))))
        ),
        Effect.catchTag("HttpClientError", (error) =>
          Effect.logWarning("Reclaim could not be reached", path, error).pipe(
            Effect.andThen(Effect.fail(failed("Reclaim could not be reached. Try again in a minute.")))
          )
        ),
        Effect.withSpan("reclaim", { attributes: { path } })
      ) as Effect.Effect<S["Type"], Errors.SourceFailed, S["DecodingServices"]>
    }

    const get = <S extends Schema.Top>(path: string, schema: S) => send(HttpClientRequest.get(path), schema)

    return Reclaim.of({
      calendars: Effect.gen(function* () {
        const accounts = yield* get("/api/accounts/calendars", Schema.Record(Schema.String, Schema.Array(WireCalendar)))
        const credentials = yield* get("/api/credentials", Schema.Array(WireCredential))
        return Arr.map(
          Arr.filter(Arr.flatten(Object.values(accounts)), (calendar) => calendar.connected && calendar.id > 0),
          (calendar): SourceCalendar => ({
            id: Calendar.CalendarId.make(calendar.id),
            name: calendar.name,
            color: calendar.colorHex ?? "#888888",
            account: calendar.credentialId,
            email: credentials.find((credential) => credential.id === calendar.credentialId)?.email ?? "",
            providerId: Option.fromNullishOr(calendar.externalId)
          })
        )
      }),
      events: (first, end) =>
        get(`/api/events/v2?start=${first}&end=${end}&allConnected=true`, Schema.Array(WireEvent)).pipe(
          Effect.map(Arr.map(entryOf))
        ),
      providerId: (calendar, event) =>
        get(
          `/api/events/raw-event/${calendar.account}/${calendar.id}/${encodeURIComponent(event)}`,
          Schema.Struct({ rawData: Schema.optional(Schema.NullOr(Schema.Struct({ id: Schema.String }))) })
        ).pipe(
          Effect.flatMap((raw) =>
            raw.rawData == null
              ? Effect.fail(failed("Reclaim answered with an event that has no provider id."))
              : Effect.succeed(raw.rawData.id)
          )
        ),
      reply: (calendar, event, reply) =>
        Effect.asVoid(
          send(
            HttpClientRequest.bodyJsonUnsafe(
              HttpClientRequest.put(`/api/planner/event/rsvp/${calendar}/${encodeURIComponent(event)}`),
              { responseStatus: responses[reply], sendUpdates: true }
            ),
            Schema.Unknown
          )
        )
    })
  })

/** Reclaim with the owner's API key; without one, every read fails saying so. */
export const live = Layer.effect(
  Reclaim,
  Effect.gen(function* () {
    const apiKey = yield* Config.option(Config.Redacted("RAS_RECLAIM_API_KEY")).pipe(Effect.orDie)
    return yield* Option.match(apiKey, {
      onNone: () => {
        const unset = Effect.fail(failed("Reclaim is not connected: ras has no API key. Set RAS_RECLAIM_API_KEY."))
        return Effect.succeed(
          Reclaim.of({ calendars: unset, events: () => unset, providerId: () => unset, reply: () => unset })
        )
      },
      onSome: make
    })
  })
).pipe(Layer.provide(FetchHttpClient.layer))
