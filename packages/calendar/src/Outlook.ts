import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Ref from "effect/Ref"
import * as Schema from "effect/Schema"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Global from "@ras/global"
import * as Errors from "@ras/kernel/Errors"
import * as Time from "@ras/kernel/Time"

/** Every clock Graph is sent is Prague's, so a series keeps its clock across a daylight-saving change. */
export const timeZone = "Europe/Prague"

/** A wall-clock time, `2026-10-22T09:00:00`, in `timeZone`. */
export interface Clock {
  readonly dateTime: string
  readonly timeZone: string
}

export interface Recurrence {
  readonly pattern: {
    readonly type: "daily" | "weekly" | "absoluteMonthly" | "absoluteYearly"
    readonly interval: number
    readonly daysOfWeek?: ReadonlyArray<string>
    readonly firstDayOfWeek?: string
    readonly dayOfMonth?: number
    readonly month?: number
  }
  readonly range: {
    readonly type: "noEnd" | "endDate" | "numbered"
    readonly startDate: string
    readonly endDate?: string
    readonly numberOfOccurrences?: number
    readonly recurrenceTimeZone: string
  }
}

/** An event body for a create, or for a change where every field left out stays as it is. */
export interface Write {
  readonly subject?: string
  readonly body?: { readonly contentType: "text"; readonly content: string }
  readonly start?: Clock
  readonly end?: Clock
  readonly isAllDay?: boolean
  readonly location?: { readonly displayName: string }
  readonly showAs?: string
  readonly recurrence?: Recurrence
  /** Graph keeps one event per id, so a create retried after a timeout is not written twice. */
  readonly transactionId?: string
}

/** Plain events in the calendars of the owner's Outlook account: the writes Reclaim's API cannot make. */
export class Outlook extends Context.Service<
  Outlook,
  {
    readonly create: (
      calendar: string,
      write: Write
    ) => Effect.Effect<{ readonly id: string; readonly link: string | null }, Errors.SourceFailed>
    readonly change: (event: string, write: Write) => Effect.Effect<void, Errors.SourceFailed>
    readonly cancel: (event: string) => Effect.Effect<void, Errors.SourceFailed>
    /** The id of a series' occurrence that starts at `start`, a Prague local time, which a change to it alone takes. */
    readonly occurrence: (series: string, start: Time.PragueLocal) => Effect.Effect<string, Errors.SourceFailed>
  }
>()("@ras/calendar/Outlook") {}

const failed = (reason: string) => new Errors.SourceFailed({ source: "graph", reason })

const refusal = (status: number) =>
  status === 401 || status === 403
    ? "Outlook refused ras access to the calendar. Connect Outlook again under Settings, Connections."
    : status === 404
      ? "Outlook no longer has that event. Search the calendar again."
      : status === 429
        ? "Outlook is limiting requests. Try again in a minute."
        : status >= 500
          ? "Outlook is having trouble. Try again in a minute."
          : `Outlook refused the change (${status}).`

const Instances = Schema.Struct({
  value: Schema.Array(Schema.Struct({ id: Schema.String, start: Schema.Struct({ dateTime: Schema.String }) }))
})

const Created = Schema.Struct({ id: Schema.String, webLink: Schema.optional(Schema.NullOr(Schema.String)) })

export const make = Effect.gen(function* () {
  const graph = yield* Global.Graph
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest(HttpClientRequest.prependUrl("https://graph.microsoft.com/v1.0")),
    HttpClient.retryTransient({ times: 3 })
  )

  const send = (request: HttpClientRequest.HttpClientRequest) =>
    Effect.gen(function* () {
      const token = yield* graph.token
      const response = yield* client
        .execute(
          request.pipe(
            HttpClientRequest.bearerToken(Redacted.value(token)),
            HttpClientRequest.setHeader("Prefer", `outlook.timezone="${timeZone}"`)
          )
        )
        .pipe(
          Effect.catchTag("HttpClientError", (error) =>
            Effect.logWarning("Graph could not be reached", request.method, request.url, error).pipe(
              Effect.andThen(Effect.fail(failed("Outlook could not be reached. Try again in a minute.")))
            )
          )
        )
      if (response.status >= 200 && response.status < 300) return response
      yield* Effect.logWarning(
        "Graph refused",
        request.method,
        request.url,
        response.status,
        yield* Effect.orElseSucceed(response.text, () => "")
      )
      return yield* Effect.fail(failed(refusal(response.status)))
    }).pipe(Effect.withSpan("graph", { attributes: { method: request.method } }))

  return Outlook.of({
    create: (calendar, write) =>
      send(
        HttpClientRequest.bodyJsonUnsafe(
          HttpClientRequest.post(`/me/calendars/${encodeURIComponent(calendar)}/events`),
          write
        )
      ).pipe(
        Effect.flatMap((response) =>
          HttpClientResponse.schemaBodyJson(Created)(response).pipe(
            Effect.mapError(() => failed("Outlook answered with something ras cannot read."))
          )
        ),
        Effect.map((created) => ({ id: created.id, link: created.webLink ?? null }))
      ),
    change: (event, write) =>
      Effect.asVoid(
        send(
          HttpClientRequest.bodyJsonUnsafe(HttpClientRequest.patch(`/me/events/${encodeURIComponent(event)}`), write)
        )
      ),
    cancel: (event) => Effect.asVoid(send(HttpClientRequest.delete(`/me/events/${encodeURIComponent(event)}`))),
    occurrence: (series, start) =>
      Effect.gen(function* () {
        const day = Time.PragueDate.make(start.slice(0, 10))
        const query = new URLSearchParams({
          startDateTime: `${day}T00:00:00`,
          endDateTime: `${Time.addDays(day, 1)}T00:00:00`,
          $select: "id,start"
        })
        const response = yield* send(
          HttpClientRequest.get(`/me/events/${encodeURIComponent(series)}/instances?${query}`)
        )
        const instances = yield* HttpClientResponse.schemaBodyJson(Instances)(response).pipe(
          Effect.mapError(() => failed("Outlook answered with something ras cannot read."))
        )
        const found = instances.value.find((instance) => instance.start.dateTime.startsWith(start))
        return found === undefined
          ? yield* Effect.fail(
              failed("Outlook has no occurrence of the series at that time. Search the calendar again.")
            )
          : found.id
      })
  })
})

export const live = Layer.effect(Outlook, make).pipe(Layer.provide(FetchHttpClient.layer))

/** One call the sample answered, for tests to read. */
export type Call =
  | { readonly _tag: "Create"; readonly calendar: string; readonly write: Write }
  | { readonly _tag: "Change"; readonly event: string; readonly write: Write }
  | { readonly _tag: "Cancel"; readonly event: string }
  | { readonly _tag: "Occurrence"; readonly series: string; readonly start: string }

/** The calls the sample answered; the sample writes nothing anywhere. */
export const sampleCalls = Ref.makeUnsafe<ReadonlyArray<Call>>([])

const record = (call: Call) => Ref.update(sampleCalls, (all) => [...all, call])

export const sample = Layer.succeed(
  Outlook,
  Outlook.of({
    create: (calendar, write) =>
      Effect.as(record({ _tag: "Create", calendar, write }), {
        id: `sample-${write.transactionId ?? "event"}`,
        link: null
      }),
    change: (event, write) => record({ _tag: "Change", event, write }),
    cancel: (event) => record({ _tag: "Cancel", event }),
    occurrence: (series, start) => Effect.as(record({ _tag: "Occurrence", series, start }), `${series}@${start}`)
  })
)
