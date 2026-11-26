import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient"
import * as Arr from "effect/Array"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Redacted from "effect/Redacted"
import * as Ref from "effect/Ref"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import * as Cookies from "effect/http/Cookies"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as HttpApiClient from "effect/http-api/HttpApiClient"
import * as SqlClient from "effect/sql/SqlClient"
import * as Api from "@ras/api/api"

/** The ras a smoke run checks, at its own address, and the owner it signs in as. */
export interface Target {
  readonly url: URL
  readonly owner: { readonly email: string; readonly password: Redacted.Redacted }
}

export class SmokeFailed extends Schema.TaggedError<SmokeFailed>()("SmokeFailed", { message: Schema.String }) {}

const failed = (message: string) => new SmokeFailed({ message })

/** How a connector that holds its token kept calling tools when an instance it had no session with answered. */
export type Recovery = "refreshed" | "reinitialized"

const Health = Schema.Struct({ ok: Schema.Boolean, instance: Schema.String })

/** The instance answering `/health`, waiting while one starts. */
export const instance = (url: URL) =>
  HttpClient.get(new URL("/health", url)).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(Health)),
    Effect.map((health) => health.instance),
    Effect.retry(Schedule.spaced(Duration.millis(500))),
    Effect.timeout(Duration.minutes(2)),
    Effect.mapError(() => failed(`${url.origin}/health did not answer within two minutes.`))
  )

const signIn = (target: Target) =>
  HttpClientRequest.post(new URL("/auth/sign-in/email", target.url)).pipe(
    HttpClientRequest.setHeader("origin", target.url.origin),
    HttpClientRequest.bodyJsonUnsafe({ email: target.owner.email, password: Redacted.value(target.owner.password) }),
    HttpClient.execute,
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.map((response) => Cookies.toCookieHeader(response.cookies)),
    Effect.mapError(() => failed(`The owner ${target.owner.email} could not sign in.`))
  )

const owner = (url: URL, cookie: string) =>
  HttpApiClient.make(Api.Api, {
    baseUrl: url.origin,
    transformClient: HttpClient.mapRequest(HttpClientRequest.setHeader("cookie", cookie))
  })

type Owner = Effect.Success<ReturnType<typeof owner>>

const write = (client: Owner, title: string) =>
  Effect.map(client.work.addTask({ payload: { title } }), (task) => task.id)

/** Whether the task the owner wrote is still there; a lost session counts as lost too. */
const survived = (client: Owner, id: Parameters<Owner["work"]["task"]>[0]["params"]["id"]) =>
  client.work.task({ params: { id } }).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false)
  )

const cleanUp = (client: Owner, ids: ReadonlyArray<Parameters<Owner["work"]["deleteTask"]>[0]["params"]["id"]>) =>
  Effect.ignore(Effect.forEach(ids, (id) => client.work.deleteTask({ params: { id } }), { concurrency: 4 }))

const Registered = Schema.Struct({ client_id: Schema.String })
const Consented = Schema.Struct({ url: Schema.String })
const Tokens = Schema.Struct({ access_token: Schema.String, refresh_token: Schema.String })
const RpcResponse = Schema.Struct({
  result: Schema.optionalKey(Schema.Struct({ isError: Schema.optionalKey(Schema.Boolean) })),
  error: Schema.optionalKey(Schema.Struct({ message: Schema.String }))
})
const decodeRpc = Schema.decodeUnknownEffect(Schema.fromJsonString(RpcResponse))

/** The query the consent page sends back: the signature and every parameter it signed. */
const signedQuery = (consent: URL) => {
  const signed = new Set(consent.searchParams.getAll("ba_param"))
  return new URLSearchParams(
    Arr.filter([...consent.searchParams], ([key]) => key === "sig" || key === "ba_param" || signed.has(key))
  ).toString()
}

/**
 * An MCP connector the owner allowed, over HTTP alone: it registers, takes the owner's session through authorization
 * and consent, and holds the tokens it redeems. Like a client that follows the MCP spec, it refreshes its token when
 * ras answers 401 and starts a new session when ras answers 404, so neither needs the owner again.
 */
const connector = (url: URL, cookie: string) =>
  Effect.gen(function* () {
    const resource = new URL("/mcp", url).href
    const redirect = new URL("/smoke/callback", url).href
    const clientId = yield* HttpClientRequest.post(new URL("/auth/oauth2/register", url)).pipe(
      HttpClientRequest.bodyJsonUnsafe({
        client_name: "ras smoke run",
        redirect_uris: [redirect],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"]
      }),
      HttpClient.execute,
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Registered)),
      Effect.map((registered) => registered.client_id)
    )

    const verifier = `${crypto.randomUUID()}${crypto.randomUUID()}`
    const authorization = new URL("/auth/oauth2/authorize", url)
    authorization.search = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirect,
      scope: "openid profile email offline_access",
      state: crypto.randomUUID(),
      code_challenge: new Bun.CryptoHasher("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      resource
    }).toString()
    const consentPage = yield* HttpClientRequest.get(authorization).pipe(
      HttpClientRequest.setHeader("cookie", cookie),
      HttpClient.execute,
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "manual" }),
      Effect.flatMap((response) =>
        Option.match(Option.fromNullishOr(response.headers["location"]), {
          onNone: () => Effect.fail(failed(`Authorization answered ${response.status} without a redirect.`)),
          onSome: (location) => Effect.succeed(new URL(location, url))
        })
      )
    )
    const consented = yield* HttpClientRequest.post(new URL("/auth/oauth2/consent", url)).pipe(
      HttpClientRequest.setHeader("cookie", cookie),
      HttpClientRequest.setHeader("origin", url.origin),
      HttpClientRequest.bodyJsonUnsafe({ accept: true, oauth_query: signedQuery(consentPage) }),
      HttpClient.execute,
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Consented))
    )
    const code = new URL(consented.url).searchParams.get("code")
    if (code === null) return yield* Effect.fail(failed(`Consent sent no code: ${consented.url}`))

    const token = (params: Record<string, string>) =>
      HttpClientRequest.post(new URL("/auth/oauth2/token", url)).pipe(
        HttpClientRequest.bodyUrlParams({ ...params, client_id: clientId, resource }),
        HttpClient.execute,
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap(HttpClientResponse.schemaBodyJson(Tokens))
      )
    const tokens = yield* Ref.make(
      yield* token({ grant_type: "authorization_code", code, redirect_uri: redirect, code_verifier: verifier })
    )
    const session = yield* Ref.make(Option.none<string>())
    const recoveries = yield* Ref.make<ReadonlyArray<Recovery>>([])

    const post = (message: object) =>
      Effect.gen(function* () {
        const request = HttpClientRequest.post(resource).pipe(
          HttpClientRequest.setHeader("accept", "application/json, text/event-stream"),
          HttpClientRequest.bearerToken((yield* Ref.get(tokens)).access_token),
          HttpClientRequest.bodyJsonUnsafe({ jsonrpc: "2.0", ...message })
        )
        return yield* HttpClient.execute(
          Option.match(yield* Ref.get(session), {
            onNone: () => request,
            onSome: (id) => HttpClientRequest.setHeader(request, "mcp-session-id", id)
          })
        )
      })

    const initialize = Effect.gen(function* () {
      yield* Ref.set(session, Option.none())
      const response = yield* post({
        id: 0,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "ras-smoke", version: "1" } }
      })
      if (response.status !== 200) return yield* Effect.fail(failed(`initialize answered ${response.status}.`))
      yield* Ref.set(session, Option.fromNullishOr(response.headers["mcp-session-id"]))
      yield* post({ method: "notifications/initialized" })
    })
    yield* initialize

    const refresh = Effect.gen(function* () {
      const current = yield* Ref.get(tokens)
      yield* Ref.set(tokens, yield* token({ grant_type: "refresh_token", refresh_token: current.refresh_token }))
    })

    const recover = (recovery: Recovery) =>
      Effect.gen(function* () {
        if (recovery === "refreshed") yield* refresh
        else yield* initialize
        yield* Ref.update(recoveries, (done) => [...done, recovery])
      })

    const attempt = (name: string, left: number): Effect.Effect<void, unknown, HttpClient.HttpClient> =>
      Effect.gen(function* () {
        const response = yield* post({ id: 1, method: "tools/call", params: { name, arguments: {} } })
        if (left > 0 && (response.status === 401 || response.status === 404)) {
          yield* recover(response.status === 401 ? "refreshed" : "reinitialized")
          return yield* attempt(name, left - 1)
        }
        if (response.status !== 200) return yield* Effect.fail(failed(`${name} answered ${response.status}.`))
        const text = yield* response.text
        const body = yield* decodeRpc(
          (response.headers["content-type"] ?? "").startsWith("text/event-stream")
            ? Arr.join(
                Arr.map(
                  Arr.filter(text.split("\n"), (line) => line.startsWith("data:")),
                  (line) => line.slice(5).trim()
                ),
                ""
              )
            : text
        )
        if (body.error !== undefined || body.result?.isError === true)
          return yield* Effect.fail(failed(`${name} refused: ${body.error?.message ?? text}`))
      })

    /** Calls a tool that takes no arguments, recovering at most twice. */
    const call = (name: string) =>
      attempt(name, 2).pipe(
        Effect.mapError((error) =>
          error instanceof SmokeFailed ? error : failed(`The connector could not call ${name}: ${String(error)}`)
        )
      )
    return { call, recoveries: Ref.get(recoveries) }
  }).pipe(
    Effect.mapError((error) =>
      error instanceof SmokeFailed ? error : failed(`The connector could not connect: ${String(error)}`)
    )
  )

/** Runs `stop` until another instance answers than `before`, at most `attempts` times. */
const awaitNewInstance = <R>(
  url: URL,
  before: string,
  stop: Effect.Effect<void, SmokeFailed, R>,
  attempts: number
): Effect.Effect<string, SmokeFailed, HttpClient.HttpClient | R> =>
  attempts === 0
    ? Effect.fail(failed(`Still the same instance ${before}: it never stopped while idle.`))
    : Effect.gen(function* () {
        yield* stop
        const after = yield* instance(url)
        return after === before ? yield* awaitNewInstance(url, before, stop, attempts - 1) : after
      })

const run = () => `ras smoke ${new Date().toISOString()}`

/**
 * Writes a task and connects a connector, runs `stop` until another instance answers, then reads the task back with
 * the owner's session from before and calls a tool on the connector's token from before.
 */
export const idle = <R>(
  target: Target,
  options: { readonly stop: Effect.Effect<void, SmokeFailed, R>; readonly attempts: number }
) =>
  Effect.gen(function* () {
    const cookie = yield* signIn(target)
    const client = yield* owner(target.url, cookie)
    const id = yield* Effect.mapError(write(client, `${run()} idle`), (error) => failed(`The write failed: ${error}`))
    yield* Effect.addFinalizer(() => cleanUp(client, [id]))
    const connected = yield* connector(target.url, cookie)
    yield* connected.call("whoami")

    const before = yield* instance(target.url)
    const after = yield* awaitNewInstance(target.url, before, options.stop, options.attempts)

    if (!(yield* survived(client, id)))
      return yield* Effect.fail(failed(`Instance ${after} lost the write ${id} that instance ${before} acknowledged.`))
    yield* connected.call("whoami")
    return { before, after, connector: yield* connected.recoveries }
  }).pipe(Effect.scoped)

const restoredIds = (database: string, prefix: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ readonly id: string }>`SELECT id FROM work_tasks WHERE title LIKE ${`${prefix}%`}`
    return new Set(Arr.map(rows, (row) => row.id))
  }).pipe(Effect.provide(SqliteClient.layer({ filename: database })))

/**
 * Writes tasks one after another every `pace`, runs `deploy` once `margin` of them went through, and keeps writing
 * until `margin` after another instance answers. Every write ras acknowledged must read back, and a restore of the
 * replica into an empty directory must hold every one.
 */
export const deploy = <R>(
  target: Target,
  options: {
    readonly deploy: Effect.Effect<void, SmokeFailed, R>
    readonly restore: (into: string) => Effect.Effect<void, SmokeFailed, R>
    readonly settle: Duration.Duration
    readonly margin: Duration.Duration
    readonly pace: Duration.Duration
  }
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const prefix = `${run()} deploy`
    const client = yield* owner(target.url, yield* signIn(target))
    const before = yield* instance(target.url)

    const acknowledged = yield* Ref.make<ReadonlyArray<Parameters<typeof survived>[1]>>([])
    yield* Effect.addFinalizer(() => Effect.flatMap(Ref.get(acknowledged), (ids) => cleanUp(client, ids)))
    const refused = yield* Ref.make(0)
    const stopping = yield* Ref.make(false)
    const writeNext = (n: number): Effect.Effect<void> =>
      Effect.gen(function* () {
        if (yield* Ref.get(stopping)) return
        yield* write(client, `${prefix} ${n}`).pipe(
          Effect.flatMap((id) => Ref.update(acknowledged, (ids) => [...ids, id])),
          Effect.catch(() => Ref.update(refused, (count) => count + 1))
        )
        yield* Effect.sleep(options.pace)
        yield* writeNext(n + 1)
      })
    const writer = yield* Effect.forkScoped(writeNext(1))

    yield* Effect.sleep(options.margin)
    yield* options.deploy
    const after = yield* instance(target.url).pipe(
      Effect.repeat({ schedule: Schedule.spaced(options.pace), until: (now) => now !== before }),
      Effect.timeout(options.settle),
      Effect.mapError(() => failed(`No instance but ${before} answered within ${Duration.format(options.settle)}.`))
    )
    yield* Effect.sleep(options.margin)
    yield* Ref.set(stopping, true)
    yield* Fiber.await(writer)

    const ids = yield* Ref.get(acknowledged)
    const lost = yield* Effect.filter(ids, (id) => Effect.map(survived(client, id), (found) => !found), {
      concurrency: 4
    })
    if (lost.length > 0)
      return yield* Effect.fail(failed(`The deploy lost ${lost.length} of the ${ids.length} writes ras acknowledged.`))

    const restored = yield* Effect.scoped(
      Effect.gen(function* () {
        const into = path.join(yield* fs.makeTempDirectoryScoped({ prefix: "ras-smoke-" }), "ras.db")
        yield* options.restore(into)
        const found = yield* restoredIds(into, prefix)
        const missing = Arr.filter(ids, (id) => !found.has(id)).length
        if (missing > 0)
          return yield* Effect.fail(failed(`The restored replica lacks ${missing} of the ${ids.length} writes.`))
        return ids.length
      })
    ).pipe(
      Effect.retry({ times: 6, schedule: Schedule.spaced(Duration.seconds(10)) }),
      Effect.mapError((error) => (error instanceof SmokeFailed ? error : failed(`The restore failed: ${error}`)))
    )

    return { before, after, acknowledged: ids.length, refused: yield* Ref.get(refused), restored }
  }).pipe(Effect.scoped)
