import * as Effect from "effect/Effect"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpServerRequest from "effect/http/HttpServerRequest"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as Auth from "./Auth.ts"
import * as Pages from "./Pages.ts"

/** better-auth's endpoints under `/auth`, its discovery documents under `/.well-known`, and the two pages it sends the owner to. */
export const routes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const auth = yield* Auth.Auth
    const handle = (request: HttpServerRequest.HttpServerRequest) =>
      HttpServerRequest.toWeb(request).pipe(
        Effect.flatMap((web) => Effect.promise(() => auth.handler(web))),
        Effect.map(HttpServerResponse.fromWeb),
        Effect.catchTag("RequestParseError", () => Effect.succeed(HttpServerResponse.empty({ status: 400 })))
      )
    yield* router.add("*", `${Auth.basePath}/*`, handle)
    yield* router.add("GET", "/.well-known/*", handle)
    yield* router.add("GET", Auth.signInPage, Effect.succeed(Pages.signIn))
    yield* router.add("GET", Auth.consentPage, Effect.succeed(Pages.consent))
  })
)
