import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Ref from "effect/Ref"
import * as Schema from "effect/Schema"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Global from "@ras/global"
import * as Errors from "@ras/kernel/Errors"

/** A timed moment in a named zone, or a whole day. */
export type Moment = { readonly dateTime: string; readonly timeZone: string } | { readonly date: string }

/** An event body for an insert, or for a patch where every field left out stays as it is. */
export interface Body {
  readonly id?: string
  readonly summary?: string
  readonly description?: string
  readonly location?: string
  readonly start?: Moment
  readonly end?: Moment
  readonly transparency?: "opaque" | "transparent"
  readonly recurrence?: ReadonlyArray<string>
}

/** Plain events in the calendars of the owner's Google account, through the Calendar API. */
export class GoogleCalendar extends Context.Service<
  GoogleCalendar,
  {
    /** Writes the event once however often it is retried, since Google keeps one event per id. */
    readonly insert: (
      calendar: string,
      body: Body & { readonly id: string }
    ) => Effect.Effect<{ readonly id: string; readonly link: string | null }, Errors.SourceFailed>
    readonly patch: (calendar: string, event: string, body: Body) => Effect.Effect<void, Errors.SourceFailed>
    readonly remove: (calendar: string, event: string) => Effect.Effect<void, Errors.SourceFailed>
    /** The email of the account connected to ras, whose calendars the Calendar API writes; none until one is connected. */
    readonly account: Effect.Effect<Option.Option<string>>
    /** Reads one event of the primary calendar, the cheapest call that proves Google takes the token. */
    readonly reach: Effect.Effect<void, Errors.SourceFailed>
  }
>()("@ras/calendar/GoogleCalendar") {}

const failed = (reason: string) => new Errors.SourceFailed({ source: "google", reason })

const refusal = (status: number) =>
  status === 401 || status === 403
    ? "Google refused ras access to the calendar. Connect Google again under Settings, Connections."
    : status === 404 || status === 410
      ? "Google no longer has that event. Search the calendar again."
      : status === 429
        ? "Google is limiting requests. Try again in a minute."
        : status >= 500
          ? "Google is having trouble. Try again in a minute."
          : `Google refused the change (${status}).`

const Stored = Schema.Struct({ id: Schema.String, htmlLink: Schema.optional(Schema.NullOr(Schema.String)) })

const stored = (response: HttpClientResponse.HttpClientResponse) =>
  HttpClientResponse.schemaBodyJson(Stored)(response).pipe(
    Effect.mapError(() => failed("Google answered with something ras cannot read.")),
    Effect.map((event) => ({ id: event.id, link: event.htmlLink ?? null }))
  )

const path = (calendar: string, event?: string) =>
  `/calendars/${encodeURIComponent(calendar)}/events${event === undefined ? "" : `/${encodeURIComponent(event)}`}`

export const make = Effect.gen(function* () {
  const google = yield* Global.Google
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest(HttpClientRequest.prependUrl("https://www.googleapis.com/calendar/v3")),
    HttpClient.retryTransient({ times: 3 })
  )

  /** The answer of a call Google took, or the status of one it refused. */
  const send = (request: HttpClientRequest.HttpClientRequest) =>
    Effect.gen(function* () {
      const token = yield* google.token
      const response = yield* client
        .execute(request.pipe(HttpClientRequest.bearerToken(Redacted.value(token))))
        .pipe(
          Effect.catchTag("HttpClientError", (error) =>
            Effect.logWarning("Google could not be reached", request.method, request.url, error).pipe(
              Effect.andThen(Effect.fail(failed("Google could not be reached. Try again in a minute.")))
            )
          )
        )
      if (response.status >= 200 && response.status < 300) return Option.some(response)
      if (response.status === 409) return Option.none()
      yield* Effect.logWarning(
        "Google refused",
        request.method,
        request.url,
        response.status,
        yield* Effect.orElseSucceed(response.text, () => "")
      )
      return yield* Effect.fail(failed(refusal(response.status)))
    }).pipe(Effect.withSpan("google", { attributes: { method: request.method } }))

  const accepted = (request: HttpClientRequest.HttpClientRequest) =>
    Effect.flatMap(
      send(request),
      Option.match({
        onNone: () => Effect.fail(failed(refusal(409))),
        onSome: Effect.succeed
      })
    )

  return GoogleCalendar.of({
    account: Effect.map(
      google.connection,
      Option.map((connection) => connection.account)
    ),
    reach: Effect.asVoid(accepted(HttpClientRequest.get("/calendars/primary/events?maxResults=1"))),
    insert: (calendar, body) =>
      Effect.flatMap(
        send(HttpClientRequest.bodyJsonUnsafe(HttpClientRequest.post(path(calendar)), body)),
        Option.match({
          onSome: stored,
          onNone: () => Effect.flatMap(accepted(HttpClientRequest.get(path(calendar, body.id))), stored)
        })
      ),
    patch: (calendar, event, body) =>
      Effect.asVoid(accepted(HttpClientRequest.bodyJsonUnsafe(HttpClientRequest.patch(path(calendar, event)), body))),
    remove: (calendar, event) => Effect.asVoid(accepted(HttpClientRequest.delete(path(calendar, event))))
  })
})

export const live = Layer.effect(GoogleCalendar, make).pipe(Layer.provide(FetchHttpClient.layer))

/** One call the sample answered, for tests to read. */
export type Call =
  | { readonly _tag: "Insert"; readonly calendar: string; readonly body: Body }
  | { readonly _tag: "Patch"; readonly calendar: string; readonly event: string; readonly body: Body }
  | { readonly _tag: "Remove"; readonly calendar: string; readonly event: string }

/** The calls the sample answered; the sample writes nothing anywhere. */
export const sampleCalls = Ref.makeUnsafe<ReadonlyArray<Call>>([])

const record = (call: Call) => Ref.update(sampleCalls, (all) => [...all, call])

/** The account of the sample's Google calendar. */
export const sampleAccount = "owner@gmail.example.com"

export const sample = Layer.succeed(
  GoogleCalendar,
  GoogleCalendar.of({
    insert: (calendar, body) =>
      Effect.andThen(
        Effect.yieldNow,
        Effect.as(record({ _tag: "Insert", calendar, body }), { id: body.id, link: null })
      ),
    patch: (calendar, event, body) => record({ _tag: "Patch", calendar, event, body }),
    remove: (calendar, event) => record({ _tag: "Remove", calendar, event }),
    account: Effect.succeed(Option.some(sampleAccount)),
    reach: Effect.void
  })
)
