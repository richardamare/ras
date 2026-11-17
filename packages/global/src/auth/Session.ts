import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as HttpServerRequest from "effect/http/HttpServerRequest"
import * as HttpApiError from "effect/http-api/HttpApiError"
import * as Actor from "../audit/Actor.ts"
import * as Auth from "./Auth.ts"
import * as Http from "../Http.ts"

const console = new Actor.Actor({ channel: { _tag: "Console" }, agent: Option.none() })

/** The console's session check: the owner's better-auth session cookie, or 401. */
export const layer = Layer.effect(
  Http.Authenticated,
  Effect.gen(function* () {
    const auth = yield* Auth.Auth
    return (httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const session = yield* Effect.promise(() => auth.api.getSession({ headers: new Headers(request.headers) }))
        if (session === null) return yield* new HttpApiError.Unauthorized({})
        return yield* Effect.provideService(httpEffect, Actor.CurrentActor, console)
      })
  })
)
