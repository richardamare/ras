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
import * as Errors from "@ras/kernel/Errors"
import * as Time from "@ras/kernel/Time"
import * as Actor from "../audit/Actor.ts"
import * as Auth from "../auth/Auth.ts"
import * as Pages from "../auth/Pages.ts"
import * as Writes from "../audit/Writes.ts"
import * as TokenRepository from "./TokenRepository.ts"

/** An account provider ras connects to with the authorization code flow and PKCE, keeping one connection. */
export interface Provider {
  /** Names the tables, the audit action, the refusal codes and the failing source. */
  readonly name: string
  /** What the owner connects, such as Outlook. */
  readonly label: string
  /** Who the owner signs in to, such as Microsoft. */
  readonly signIn: string
  readonly authorize: string
  readonly token: string
  readonly scope: string
  readonly authorizeParams: Readonly<Record<string, string>>
  /** Whether the token endpoint takes the scope again with each grant. */
  readonly scopeOnGrant: boolean
  readonly clientId: string
  readonly clientSecret: string
  readonly callbackPath: HttpRouter.PathInput
}

/** A token is refreshed once it has less than this left. */
const margin = Duration.minutes(2)
const attemptLifetime = Duration.minutes(10)

export class Connection extends Schema.Class<Connection>("Connection")({
  account: Schema.String,
  connected: Time.PragueLocal
}) {}

export interface Service {
  /** Starts connecting: the URL the owner opens to sign in and allow the scope. */
  readonly connect: Effect.Effect<URL, Errors.Refused>
  /** Ends a connection the provider sent back to the callback, storing its tokens. */
  readonly complete: (
    state: string,
    code: string
  ) => Effect.Effect<Connection, Errors.Refused | Errors.SourceFailed, Actor.CurrentActor>
  readonly connection: Effect.Effect<Option.Option<Connection>>
  /** A current access token, refreshed when it is about to expire, whoever asks. */
  readonly token: Effect.Effect<Redacted.Redacted, Errors.SourceFailed>
}

const TokenAnswer = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.optional(Schema.String),
  expires_in: Schema.Number,
  id_token: Schema.optional(Schema.String)
})
type TokenAnswer = typeof TokenAnswer.Type

const random = () => Base64Url.encode(crypto.getRandomValues(new Uint8Array(32)))

/** The account an ID token names; it came straight from the provider's token endpoint, so it is read, not verified. */
const accountOf = (idToken: string | undefined, fallback: string): string =>
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
    () => fallback
  )

/** Seals the tokens with a key derived from the auth secret, so a backup of the database does not carry them readable. */
const sealer = (secret: Redacted.Redacted, name: string) =>
  Effect.promise(async () => {
    const material = new TextEncoder().encode(`${Redacted.value(secret)}:${name}-tokens`)
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

const make = (provider: Provider) =>
  Effect.gen(function* () {
    const tokens = yield* TokenRepository.make(provider.name)
    const writes = yield* Writes.Writes
    const http = yield* HttpClient.HttpClient
    const auth = yield* Auth.settings
    const app = yield* Config.option(
      Config.all({ id: Config.String(provider.clientId), secret: Config.Redacted(provider.clientSecret) })
    )
    const { seal, open } = yield* sealer(auth.secret, provider.name)
    const one = yield* Semaphore.make(1)
    const redirect = new URL(provider.callbackPath, auth.url).href
    const { label, signIn } = provider

    const failed = (reason: string) => new Errors.SourceFailed({ source: provider.name, reason })
    const refuse = (code: string, reason: string, instead: string) =>
      Effect.fail(new Errors.Refused({ code: `global.${provider.name}.${code}`, reason, instead }))

    const unset = `ras has no ${signIn} app to connect ${label} with. Set ${provider.clientId} and ${provider.clientSecret}.`

    /** Redeems a grant at the provider's token endpoint. */
    const redeem = (grant: Readonly<Record<string, string>>) =>
      Effect.gen(function* () {
        if (Option.isNone(app)) return yield* Effect.fail(failed(unset))
        const request = HttpClientRequest.post(provider.token).pipe(
          HttpClientRequest.bodyUrlParams({
            client_id: app.value.id,
            client_secret: Redacted.value(app.value.secret),
            ...(provider.scopeOnGrant ? { scope: provider.scope } : {}),
            ...grant
          })
        )
        const response = yield* http
          .execute(request)
          .pipe(
            Effect.catchTag("HttpClientError", (error) =>
              Effect.logWarning(`${signIn}'s sign-in could not be reached`, error).pipe(
                Effect.andThen(Effect.fail(failed(`${signIn}'s sign-in could not be reached. Try again in a minute.`)))
              )
            )
          )
        if (response.status === 400 || response.status === 401) {
          yield* Effect.logWarning(
            `${signIn} refused a token grant`,
            response.status,
            yield* Effect.orElseSucceed(response.text, () => "")
          )
          return yield* Effect.fail(
            failed(
              `${signIn} no longer accepts ras's access to ${label}. Connect ${label} again under Settings, Connections.`
            )
          )
        }
        if (response.status < 200 || response.status >= 300)
          return yield* Effect.fail(failed(`${signIn}'s sign-in answered ${response.status}. Try again in a minute.`))
        return yield* HttpClientResponse.schemaBodyJson(TokenAnswer)(response).pipe(
          Effect.mapError(() => failed(`${signIn}'s sign-in answered with something ras cannot read.`))
        )
      }).pipe(Effect.withSpan(`${provider.name}.token`))

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
      const row = yield* tokens.tokens
      if (Option.isNone(row))
        return yield* Effect.fail(failed(`${label} is not connected. Connect it under Settings, Connections.`))
      const now = yield* DateTime.now
      if (DateTime.isGreaterThan(row.value.expires, DateTime.addDuration(now, margin)))
        return Redacted.make(yield* open(row.value.access))
      const refresh = yield* open(row.value.refresh)
      const answer = yield* redeem({ grant_type: "refresh_token", refresh_token: refresh })
      yield* tokens.refresh(yield* columns(answer, refresh))
      return Redacted.make(answer.access_token)
    }).pipe(one.withPermit)

    return {
      connect: Effect.gen(function* () {
        if (Option.isNone(app)) return yield* refuse("unset", unset, "Set them in the host's environment.")
        const state = random()
        const verifier = random()
        const challenge = Base64Url.encode(
          new Uint8Array(
            yield* Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))
          )
        )
        const now = yield* DateTime.now
        yield* tokens.startAttempt(
          state,
          verifier,
          DateTime.formatIso(DateTime.addDuration(now, attemptLifetime)),
          DateTime.formatIso(now)
        )
        const url = new URL(provider.authorize)
        url.search = new URLSearchParams({
          client_id: app.value.id,
          response_type: "code",
          redirect_uri: redirect,
          scope: provider.scope,
          state,
          code_challenge: challenge,
          code_challenge_method: "S256",
          ...provider.authorizeParams
        }).toString()
        return url
      }),

      complete: (state, code) =>
        Effect.gen(function* () {
          const taken = yield* tokens.takeAttempt(state)
          const now = yield* DateTime.now
          const attempt = Option.getOrUndefined(taken)
          if (attempt === undefined || DateTime.isLessThan(DateTime.makeUnsafe(attempt.expires), now))
            return yield* refuse(
              "attempt",
              `This sign-in to ${signIn} is not one ras started, or it took longer than ten minutes.`,
              `Start connecting ${label} again.`
            )
          const answer = yield* redeem({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirect,
            code_verifier: attempt.verifier
          })
          if (answer.refresh_token === undefined)
            return yield* Effect.fail(
              failed(`${signIn} granted no refresh token, so ras could not keep the connection.`)
            )
          const next = yield* columns(answer, answer.refresh_token)
          const connection = new Connection({
            account: accountOf(answer.id_token, label),
            connected: Time.toPragueLocal(now)
          })
          return yield* writes.run(
            `global.${provider.name}.connected`,
            Effect.as(tokens.connect(connection.account, next, DateTime.formatIso(now)), {
              result: connection,
              subject: provider.name,
              before: Option.none(),
              after: Option.some({ account: connection.account })
            })
          )
        }),

      connection: Effect.map(tokens.tokens, (row) =>
        Option.map(
          row,
          (found) => new Connection({ account: found.account, connected: Time.toPragueLocal(found.connected) })
        )
      ),

      token
    } satisfies Service
  })

/** The owner at the console, who started the connection in their browser. */
const owner = new Actor.Actor({ channel: { _tag: "Console" }, agent: Option.none() })

/** Where the provider sends the owner back after connecting; the state the attempt carries is its proof. */
const routes = <I>(tag: Context.Key<I, Service>, provider: Provider) =>
  HttpRouter.use((router) =>
    Effect.gen(function* () {
      const service = yield* tag
      const notConnected = `${provider.label} is not connected`
      yield* router.add(
        "GET",
        provider.callbackPath,
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          const query = new URL(request.url, "http://ras").searchParams
          const state = query.get("state")
          const code = query.get("code")
          if (state === null || code === null)
            return Pages.notice(
              notConnected,
              query.get("error_description") ??
                `${provider.signIn} sent no grant back. Start connecting ${provider.label} again.`,
              400
            )
          return yield* service.complete(state, code).pipe(
            Effect.map((connection) =>
              Pages.notice(`${provider.label} is connected`, `ras now reaches the calendars of ${connection.account}.`)
            ),
            Effect.catchTags({
              Refused: (refused) => Effect.succeed(Pages.notice(notConnected, refused.message, 400)),
              SourceFailed: (source) => Effect.succeed(Pages.notice(notConnected, source.reason, 502))
            })
          )
        }).pipe(Effect.provideService(Actor.CurrentActor, owner))
      )
    })
  )

type Make = ReturnType<typeof make>

/** One connected account's service class: `make` builds it over any `HttpClient`, `layer` over fetch. */
export interface Account<Self, Id extends string> extends Context.ServiceClass<Self, Id, Service> {
  readonly provider: Provider
  readonly make: Make
  readonly layer: Layer.Layer<Self, never, Exclude<Effect.Services<Make>, HttpClient.HttpClient>>
  /** Serves the provider's callback. */
  readonly routes: Layer.Layer<never, never, Self | HttpRouter.HttpRouter>
}

export const Account =
  <Self>() =>
  <const Id extends string>(id: Id, provider: Provider): Account<Self, Id> => {
    const tag = Context.Service<Self, Service>()(id)
    const built = make(provider)
    return class extends tag {
      static readonly provider = provider
      static readonly make = built
      static readonly layer = Layer.effect(tag, Effect.orDie(built)).pipe(Layer.provide(FetchHttpClient.layer))
      static readonly routes = routes(tag, provider)
    }
  }
