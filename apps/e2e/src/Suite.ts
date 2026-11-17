import * as BunServices from "@effect/platform-bun/BunServices"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Cookies from "effect/http/Cookies"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as HttpApiClient from "effect/http-api/HttpApiClient"
import * as Api from "@ras/api/api"
import * as Vitest from "vitest"
import * as Browser from "./Browser.ts"
import * as Ras from "./Ras.ts"

/** The ras the global setup started. */
export class Server extends Context.Service<Server, { readonly url: URL }>()("@ras/e2e/Server") {
  static readonly layer = Layer.sync(Server, () => ({ url: new URL(Vitest.inject("rasUrl")) }))
}

/** Everything a test file needs: the server, Chromium, an HTTP client and the Bun platform. */
export const layer = Layer.mergeAll(Server.layer, Browser.Browser.layer, FetchHttpClient.layer, BunServices.layer)

/** A page of its own on the ras under test, closed with the scope. Without a session it meets the sign-in. */
export const page = Effect.flatMap(Server, ({ url }) => Browser.open(url.origin))

/** A page whose context holds the owner's session. */
export const signedInPage = Effect.gen(function* () {
  const { url } = yield* Server
  const opened = yield* page
  const status = yield* opened.post("/auth/sign-in/email", Ras.owner, { origin: url.origin })
  if (status !== 200) return yield* Effect.die(new Error(`sign-in answered ${status}`))
  return opened
})

/** The owner's session cookie, from signing in with the owner's email and password. */
export const sessionCookie = Effect.gen(function* () {
  const { url } = yield* Server
  const response = yield* HttpClientRequest.post(new URL("/auth/sign-in/email", url)).pipe(
    HttpClientRequest.setHeader("origin", url.origin),
    HttpClientRequest.bodyJsonUnsafe(Ras.owner),
    HttpClient.execute,
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.orDie
  )
  return Cookies.toCookieHeader(response.cookies)
})

/** The typed client of ras's HTTP API, signed in as the owner unless `cookie` is empty. */
export const client = (cookie: string) =>
  Effect.gen(function* () {
    const { url } = yield* Server
    return yield* HttpApiClient.make(Api.Api, {
      baseUrl: url.origin,
      transformClient: HttpClient.mapRequest(HttpClientRequest.setHeader("cookie", cookie))
    })
  })

/** A fresh title, so tests sharing the one ras never meet each other's data. */
export const unique = (what: string) => `${what} ${crypto.randomUUID().slice(0, 8)}`
