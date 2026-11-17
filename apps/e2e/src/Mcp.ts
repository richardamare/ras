import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import * as Schema from "effect/Schema"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import type * as Browser from "./Browser.ts"
import * as Ras from "./Ras.ts"
import * as Suite from "./Suite.ts"

const Registered = Schema.Struct({ client_id: Schema.String })
const Token = Schema.Struct({ access_token: Schema.String, token_type: Schema.String })

const RpcResponse = Schema.Struct({
  id: Schema.optionalKey(Schema.Union([Schema.Number, Schema.String, Schema.Null])),
  result: Schema.optionalKey(Schema.Unknown),
  error: Schema.optionalKey(Schema.Struct({ code: Schema.Number, message: Schema.String }))
})
const decodeRpc = Schema.decodeUnknownEffect(Schema.fromJsonString(RpcResponse))

export const callbackPath = "/e2e/callback"

/** Registers a public client the way an MCP client does on first contact, with no credentials. */
export const register = (name: string) =>
  Effect.gen(function* () {
    const { url } = yield* Suite.Server
    return yield* HttpClientRequest.post(new URL("/auth/oauth2/register", url)).pipe(
      HttpClientRequest.bodyJsonUnsafe({
        client_name: name,
        redirect_uris: [new URL(callbackPath, url).href],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"]
      }),
      HttpClient.execute,
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Registered)),
      Effect.map((registered) => registered.client_id),
      Effect.orDie
    )
  })

/** A PKCE verifier and its S256 challenge. */
const pkce = () => {
  const verifier = `${crypto.randomUUID()}${crypto.randomUUID()}`
  const challenge = new Bun.CryptoHasher("sha256").update(verifier).digest("base64url")
  return { verifier, challenge }
}

/**
 * Sends `page` through ras's authorization: the owner signs in on ras's sign-in page and gives `answer` on the consent
 * page. Returns the callback URL ras redirects to and the PKCE verifier.
 */
export const authorize = (page: Browser.Page, clientId: string, answer: "Allow" | "Deny") =>
  Effect.gen(function* () {
    const { url } = yield* Suite.Server
    const { verifier, challenge } = pkce()
    const authorization = new URL("/auth/oauth2/authorize", url)
    authorization.search = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: new URL(callbackPath, url).href,
      scope: "openid profile email offline_access",
      state: crypto.randomUUID(),
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: new URL("/mcp", url).href
    }).toString()

    yield* page.goto(authorization.href)
    yield* page.getByRole("heading", { name: "Sign in to ras" }).waitFor()
    yield* page.getByLabel("Email").fill(Ras.owner.email)
    yield* page.getByLabel("Password").fill(Ras.owner.password)
    yield* page.getByRole("button", { name: "Sign in" }).click()

    yield* page.getByRole("heading", { name: "Connect an app" }).waitFor()
    yield* page.getByRole("button", { name: answer }).click()
    yield* page.waitForURL((at) => at.pathname === callbackPath)
    return { callback: yield* page.url, verifier }
  })

/** Redeems the authorization code for an access token to `/mcp`. */
export const redeem = (clientId: string, callback: URL, verifier: string) =>
  Effect.gen(function* () {
    const { url } = yield* Suite.Server
    const code = callback.searchParams.get("code")
    if (code === null) return yield* Effect.die(new Error(`no code in ${callback.href}`))
    return yield* HttpClientRequest.post(new URL("/auth/oauth2/token", url)).pipe(
      HttpClientRequest.bodyUrlParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: new URL(callbackPath, url).href,
        client_id: clientId,
        code_verifier: verifier,
        resource: new URL("/mcp", url).href
      }),
      HttpClient.execute,
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Token)),
      Effect.map((token) => token.access_token),
      Effect.orDie
    )
  })

/** A JSON-RPC message posted to `/mcp` as streamable HTTP; `token` is the bearer, if any. */
export const post = (token: Option.Option<string>, sessionId: Option.Option<string>, message: object) =>
  Effect.gen(function* () {
    const { url } = yield* Suite.Server
    const request = HttpClientRequest.post(new URL("/mcp", url)).pipe(
      HttpClientRequest.setHeader("accept", "application/json, text/event-stream"),
      HttpClientRequest.bodyJsonUnsafe({ jsonrpc: "2.0", ...message })
    )
    const authorized = Option.match(token, {
      onNone: () => request,
      onSome: (bearer) => HttpClientRequest.bearerToken(request, bearer)
    })
    const withSession = Option.match(sessionId, {
      onNone: () => authorized,
      onSome: (id) => HttpClientRequest.setHeader(authorized, "mcp-session-id", id)
    })
    return yield* Effect.orDie(HttpClient.execute(withSession))
  })

/** The JSON-RPC response in a body that is plain JSON or a server-sent event stream. */
const rpcBody = (response: HttpClientResponse.HttpClientResponse) =>
  Effect.gen(function* () {
    const text = yield* Effect.orDie(response.text)
    const json = (response.headers["content-type"] ?? "").startsWith("text/event-stream")
      ? Arr.join(
          Arr.map(
            Arr.filter(text.split("\n"), (line) => line.startsWith("data:")),
            (line) => line.slice(5).trim()
          ),
          ""
        )
      : text
    return yield* Effect.orDie(decodeRpc(json))
  })

/** An initialized MCP session with ras, as the client holding `token`. */
export const connect = (token: string) =>
  Effect.gen(function* () {
    const initialized = yield* post(Option.some(token), Option.none(), {
      id: 0,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "ras-e2e", version: "1.0.0" } }
    })
    if (initialized.status !== 200) return yield* Effect.die(new Error(`initialize answered ${initialized.status}`))
    const server = yield* rpcBody(initialized)
    const sessionId = Option.fromNullishOr(initialized.headers["mcp-session-id"])
    yield* post(Option.some(token), sessionId, { method: "notifications/initialized" })

    const ids = yield* Ref.make(0)
    /** Sends a request and answers its JSON-RPC response; a refused HTTP request fails the test. */
    const send = (method: string, params: object = {}) =>
      Effect.gen(function* () {
        const id = yield* Ref.updateAndGet(ids, (last) => last + 1)
        const response = yield* post(Option.some(token), sessionId, { id, method, params })
        if (response.status !== 200) return yield* Effect.die(new Error(`${method} answered ${response.status}`))
        return yield* rpcBody(response)
      })
    /** Sends a request and answers its result; an error response fails the test. */
    const request = (method: string, params: object = {}) =>
      Effect.flatMap(send(method, params), (body) =>
        body.error === undefined
          ? Effect.succeed(body.result)
          : Effect.die(new Error(`${method}: ${body.error.message}`))
      )

    return { server: server.result, sessionId, send, request }
  })

export type Session = Effect.Success<ReturnType<typeof connect>>

/** A session of a client registered as `name` that the owner signed in for and allowed in Chromium. */
export const allowed = (name: string) =>
  Effect.gen(function* () {
    const clientId = yield* register(name)
    const { callback, verifier } = yield* authorize(yield* Suite.page, clientId, "Allow")
    return yield* connect(yield* redeem(clientId, callback, verifier))
  })

const ToolResult = Schema.Struct({
  content: Schema.Array(Schema.Struct({ type: Schema.String, text: Schema.optionalKey(Schema.String) })),
  isError: Schema.optionalKey(Schema.Boolean)
})

/**
 * The text a tool answered, and whether it refused: with a tool error, or with the JSON-RPC error of arguments its
 * parameters reject.
 */
const answer = (session: Session, name: string, args: object) =>
  Effect.gen(function* () {
    const body = yield* session.send("tools/call", { name, arguments: args })
    if (body.error !== undefined) return { text: body.error.message, refused: true }
    const result = yield* Effect.orDie(Schema.decodeUnknownEffect(ToolResult)(body.result))
    const text = Arr.join(
      Arr.map(result.content, (part) => part.text ?? ""),
      ""
    )
    return { text, refused: result.isError === true }
  })

/** Calls a tool and decodes its JSON answer with `schema`; a refusal fails the test. */
export const call = <S extends Schema.Constraint>(session: Session, name: string, args: object, schema: S) =>
  Effect.gen(function* () {
    const { text, refused } = yield* answer(session, name, args)
    if (refused) return yield* Effect.die(new Error(`${name} refused: ${text}`))
    return yield* Effect.orDie(Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(text))
  })

/** Calls a tool that answers nothing; a refusal fails the test. */
export const run = (session: Session, name: string, args: object) =>
  Effect.gen(function* () {
    const { text, refused } = yield* answer(session, name, args)
    if (refused) return yield* Effect.die(new Error(`${name} refused: ${text}`))
  })

/** Calls a tool that must refuse, and answers the reason it gave. */
export const refusal = (session: Session, name: string, args: object) =>
  Effect.gen(function* () {
    const { text, refused } = yield* answer(session, name, args)
    if (!refused) return yield* Effect.die(new Error(`${name} did not refuse: ${text}`))
    return text
  })
