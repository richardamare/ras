import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Base64 from "effect/encoding/Base64"
import * as Base64Url from "effect/encoding/Base64Url"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as Semaphore from "effect/Semaphore"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpServerRequest from "effect/http/HttpServerRequest"
import * as SqlClient from "effect/sql/SqlClient"
import * as Errors from "@ras/kernel/Errors"
import * as Time from "@ras/kernel/Time"
import * as Actor from "./Actor.ts"
import * as Auth from "./Auth.ts"
import * as Pages from "./Pages.ts"
import * as Store from "./Store.ts"
import * as Writes from "./Writes.ts"

/** Personal Microsoft accounts sign in through the consumers tenant. */
const authority = "https://login.microsoftonline.com/consumers/oauth2/v2.0"
const scope = "openid email offline_access https://graph.microsoft.com/Calendars.ReadWrite"
export const callbackPath = "/graph/callback"

/** A token is refreshed once it has less than this left. */
const margin = Duration.minutes(2)
const attemptLifetime = Duration.minutes(10)

export class Connection extends Schema.Class<Connection>("Connection")({
  account: Schema.String,
  connected: Time.PragueLocal
}) {}

export class Graph extends Context.Service<
  Graph,
  {
    /** Starts connecting Outlook: the URL the owner opens to sign in to Microsoft and allow the calendar scope. */
    readonly connect: Effect.Effect<URL, Errors.Refused>
    /** Ends a connection Microsoft sent back to the callback, storing its tokens. */
    readonly complete: (
      state: string,
      code: string
    ) => Effect.Effect<Connection, Errors.Refused | Errors.SourceFailed, Actor.CurrentActor>
    readonly connection: Effect.Effect<Option.Option<Connection>>
    /** A current access token for Graph, refreshed when it is about to expire, whoever asks. */
    readonly token: Effect.Effect<Redacted.Redacted, Errors.SourceFailed>
  }
>()("@ras/global/Graph") {}

const TokenAnswer = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.optional(Schema.String),
  expires_in: Schema.Number,
  id_token: Schema.optional(Schema.String)
})
type TokenAnswer = typeof TokenAnswer.Type

const failed = (reason: string) => new Errors.SourceFailed({ source: "graph", reason })

const refuse = (code: string, reason: string, instead: string) =>
  Effect.fail(new Errors.Refused({ code: `global.graph.${code}`, reason, instead }))

const random = () => Base64Url.encode(crypto.getRandomValues(new Uint8Array(32)))

/** The account an ID token names; it came straight from Microsoft's token endpoint, so it is read, not verified. */
const accountOf = (idToken: string | undefined): string =>
  Option.getOrElse(
    Option.flatMap(
      Option.flatMap(Option.fromUndefinedOr(idToken?.split(".")[1]), (payload) =>
        Result.getSuccess(Base64Url.decodeString(payload))
      ),
      (json) =>
        Option.flatMap(Option.liftThrowable(() => JSON.parse(json) as Record<string, unknown>)(), (claims) =>
          Option.fromNullishOr((claims["email"] ?? claims["preferred_username"]) as string | undefined)
        )
    ),
    () => "Outlook"
  )

/** Seals the tokens with a key derived from the auth secret, so a backup of the database does not carry them readable. */
const sealer = (secret: Redacted.Redacted) =>
  Effect.promise(async () => {
    const material = new TextEncoder().encode(`${Redacted.value(secret)}:graph-tokens`)
    const key = await crypto.subtle.importKey(
      "raw",
      await crypto.subtle.digest("SHA-256", material),
      "AES-GCM",
      false,
      ["encrypt", "decrypt"]
    )
    return {
      seal: (text: string) =>
        Effect.promise(async () => {
          const iv = crypto.getRandomValues(new Uint8Array(12))
          const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text))
          return `${Base64.encode(iv)}.${Base64.encode(new Uint8Array(sealed))}`
        }),
      open: (sealed: string) =>
        Effect.promise(async () => {
          const [iv, data] = sealed.split(".") as [string, string]
          const opened = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: new Uint8Array(Result.getOrThrow(Base64.decode(iv))) },
            key,
            new Uint8Array(Result.getOrThrow(Base64.decode(data)))
          )
          return new TextDecoder().decode(opened)
        })
    }
  })

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const writes = yield* Writes.Writes
  const http = yield* HttpClient.HttpClient
  const auth = yield* Auth.settings
  const app = yield* Config.option(
    Config.all({ id: Config.String("RAS_GRAPH_CLIENT_ID"), secret: Config.Redacted("RAS_GRAPH_CLIENT_SECRET") })
  )
  const { seal, open } = yield* sealer(auth.secret)
  const one = yield* Semaphore.make(1)
  const redirect = new URL(callbackPath, auth.url).href

  const db = Effect.provideService(SqlClient.SqlClient, sql)
  const stored = db(Store.graphTokens)

  const unset = "ras has no Microsoft app to connect Outlook with. Set RAS_GRAPH_CLIENT_ID and RAS_GRAPH_CLIENT_SECRET."

  /** Redeems a grant at Microsoft's token endpoint. */
  const redeem = (grant: Readonly<Record<string, string>>) =>
    Effect.gen(function* () {
      if (Option.isNone(app)) return yield* Effect.fail(failed(unset))
      const request = HttpClientRequest.post(`${authority}/token`).pipe(
        HttpClientRequest.bodyUrlParams({
          client_id: app.value.id,
          client_secret: Redacted.value(app.value.secret),
          scope,
          ...grant
        })
      )
      const response = yield* http
        .execute(request)
        .pipe(
          Effect.catchTag("HttpClientError", (error) =>
            Effect.logWarning("Microsoft's sign-in could not be reached", error).pipe(
              Effect.andThen(Effect.fail(failed("Microsoft's sign-in could not be reached. Try again in a minute.")))
            )
          )
        )
      if (response.status === 400 || response.status === 401) {
        yield* Effect.logWarning(
          "Microsoft refused a token grant",
          response.status,
          yield* Effect.orElseSucceed(response.text, () => "")
        )
        return yield* Effect.fail(
          failed(
            "Microsoft no longer accepts ras's access to Outlook. Connect Outlook again under Settings, Connections."
          )
        )
      }
      if (response.status < 200 || response.status >= 300)
        return yield* Effect.fail(failed(`Microsoft's sign-in answered ${response.status}. Try again in a minute.`))
      return yield* HttpClientResponse.schemaBodyJson(TokenAnswer)(response).pipe(
        Effect.mapError(() => failed("Microsoft's sign-in answered with something ras cannot read."))
      )
    }).pipe(Effect.withSpan("graph.token"))

  /** The columns a token answer fills; a refresh that sends no new refresh token keeps the old one. */
  const columns = (answer: TokenAnswer, refresh: string) =>
    Effect.gen(function* () {
      const now = yield* DateTime.now
      return {
        access: yield* seal(answer.access_token),
        refresh: yield* seal(answer.refresh_token ?? refresh),
        expires: DateTime.formatIso(DateTime.add(now, { seconds: answer.expires_in }))
      }
    })

  const token = Effect.gen(function* () {
    const row = yield* stored
    if (Option.isNone(row))
      return yield* Effect.fail(failed("Outlook is not connected. Connect it under Settings, Connections."))
    const now = yield* DateTime.now
    if (DateTime.isGreaterThan(row.value.expires, DateTime.addDuration(now, margin)))
      return Redacted.make(yield* open(row.value.access))
    const refresh = yield* open(row.value.refresh)
    const answer = yield* redeem({ grant_type: "refresh_token", refresh_token: refresh })
    const next = yield* columns(answer, refresh)
    yield* db(Store.refreshGraph(next))
    return Redacted.make(answer.access_token)
  }).pipe(one.withPermit)

  return Graph.of({
    connect: Effect.gen(function* () {
      if (Option.isNone(app)) return yield* refuse("unset", unset, "Set them in the host's environment.")
      const state = random()
      const verifier = random()
      const challenge = Base64Url.encode(
        new Uint8Array(yield* Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))))
      )
      const now = yield* DateTime.now
      const expires = DateTime.formatIso(DateTime.addDuration(now, attemptLifetime))
      yield* db(Store.startGraphAttempt(state, verifier, expires, DateTime.formatIso(now)))
      const url = new URL(`${authority}/authorize`)
      url.search = new URLSearchParams({
        client_id: app.value.id,
        response_type: "code",
        redirect_uri: redirect,
        response_mode: "query",
        scope,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        prompt: "select_account"
      }).toString()
      return url
    }),

    complete: (state, code) =>
      Effect.gen(function* () {
        const taken = yield* db(Store.takeGraphAttempt(state))
        const now = yield* DateTime.now
        const attempt = Option.getOrUndefined(taken)
        if (attempt === undefined || DateTime.isLessThan(DateTime.makeUnsafe(attempt.expires), now))
          return yield* refuse(
            "attempt",
            "This sign-in to Microsoft is not one ras started, or it took longer than ten minutes.",
            "Start connecting Outlook again."
          )
        const answer = yield* redeem({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirect,
          code_verifier: attempt.verifier
        })
        if (answer.refresh_token === undefined)
          return yield* Effect.fail(failed("Microsoft granted no refresh token, so ras could not keep the connection."))
        const next = yield* columns(answer, answer.refresh_token)
        const connection = new Connection({ account: accountOf(answer.id_token), connected: Time.toPragueLocal(now) })
        return yield* writes.run(
          "global.graph.connected",
          Effect.as(db(Store.connectGraph(connection.account, next, DateTime.formatIso(now))), {
            result: connection,
            subject: "graph",
            before: Option.none(),
            after: Option.some({ account: connection.account })
          })
        )
      }),

    connection: Effect.map(stored, (row) =>
      Option.map(
        row,
        (found) => new Connection({ account: found.account, connected: Time.toPragueLocal(found.connected) })
      )
    ),

    token
  })
})

export const layer = Layer.effect(Graph, Effect.orDie(make)).pipe(Layer.provide(FetchHttpClient.layer))

/** The owner at the console, who started the connection in their browser. */
const owner = new Actor.Actor({ channel: { _tag: "Console" }, agent: Option.none() })

/** Where Microsoft sends the owner back after connecting Outlook; the state the attempt carries is its proof. */
export const routes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const graph = yield* Graph
    yield* router.add(
      "GET",
      callbackPath,
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const query = new URL(request.url, "http://ras").searchParams
        const state = query.get("state")
        const code = query.get("code")
        if (state === null || code === null)
          return Pages.notice(
            "Outlook is not connected",
            query.get("error_description") ?? "Microsoft sent no grant back. Start connecting Outlook again.",
            400
          )
        return yield* graph.complete(state, code).pipe(
          Effect.map((connection) =>
            Pages.notice("Outlook is connected", `ras now reaches the calendars of ${connection.account}.`)
          ),
          Effect.catchTags({
            Refused: (refused) => Effect.succeed(Pages.notice("Outlook is not connected", refused.message, 400)),
            SourceFailed: (source) => Effect.succeed(Pages.notice("Outlook is not connected", source.reason, 502))
          })
        )
      }).pipe(Effect.provideService(Actor.CurrentActor, owner))
    )
  })
)
