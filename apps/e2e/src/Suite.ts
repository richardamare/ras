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
import * as Playwright from "playwright"
import * as Vitest from "vitest"
import * as Ras from "./Ras.ts"

/** The ras the global setup started. */
export class Server extends Context.Service<Server, { readonly url: URL }>()("@ras/e2e/Server") {
  static readonly layer = Layer.sync(Server, () => ({ url: new URL(Vitest.inject("rasUrl")) }))
}

/** Headless Chromium, closed with the layer. */
export class Browser extends Context.Service<Browser, Playwright.Browser>()("@ras/e2e/Browser") {
  static readonly layer = Layer.effect(
    Browser,
    Effect.acquireRelease(
      Effect.promise(() => Playwright.chromium.launch()),
      (browser) => Effect.promise(() => browser.close())
    )
  )
}

/** Everything a test file needs: the server, Chromium, an HTTP client and the Bun platform. */
export const layer = Layer.mergeAll(Server.layer, Browser.layer, FetchHttpClient.layer, BunServices.layer)

/** Runs a Playwright call; its rejection fails the test. */
export const use = <A>(f: () => Promise<A>) => Effect.promise(f)

/** A page of its own browser context, in English, closed with the scope. Without a session it meets the sign-in. */
export const page = Effect.gen(function* () {
  const browser = yield* Browser
  const { url } = yield* Server
  const context = yield* Effect.acquireRelease(
    use(() => browser.newContext({ baseURL: url.origin, locale: "en-US" })),
    (opened) => use(() => opened.close())
  )
  yield* use(() => context.addInitScript(() => window.localStorage.setItem("lang", "en")))
  return yield* use(() => context.newPage())
})

/** A page whose context holds the owner's session. */
export const signedInPage = Effect.gen(function* () {
  const { url } = yield* Server
  const opened = yield* page
  const response = yield* use(() =>
    opened.request.post("/auth/sign-in/email", { data: Ras.owner, headers: { origin: url.origin } })
  )
  if (!response.ok()) return yield* Effect.die(new Error(`sign-in answered ${response.status()}`))
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
