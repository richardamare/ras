import * as BetterAuthMcp from "@better-auth/mcp"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpServerRequest from "effect/http/HttpServerRequest"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as Actor from "./Actor.ts"
import * as Auth from "./Auth.ts"
import * as OAuthClientRepository from "./OAuthClientRepository.ts"

const Claims = Schema.Struct({ sub: Schema.String, azp: Schema.String })

/**
 * Admits a request to `/mcp` that carries an access token ras issued for it to a client the owner still consents to,
 * and runs it as the owner through that client. Otherwise it answers better-auth's 401 challenge, which points the
 * client at the sign-in.
 */
const middleware = HttpRouter.middleware<{ provides: Actor.CurrentActor }>()(
  Effect.gen(function* () {
    const auth = yield* Auth.Auth
    const clients = yield* OAuthClientRepository.OAuthClientRepository
    const settings = yield* Auth.settings
    const resource = new URL(Auth.mcpPath, settings.url).href

    const verify = (headers: Headers, method: string) =>
      Effect.promise(async () => {
        let claims: unknown
        const response = await BetterAuthMcp.requireMcpAuth(
          auth,
          (_request, verified) => {
            claims = verified
            return new Response(null, { status: 204 })
          },
          { resource }
        )(new Request(resource, { method, headers }))
        return claims === undefined ? { refused: response } : { claims }
      })

    /** The challenge a request without a token gets. */
    const challenge = (method: string) =>
      Effect.map(verify(new Headers(), method), (verified) =>
        "refused" in verified ? verified.refused : new Response(null, { status: 401 })
      )

    return (httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const verified = yield* verify(new Headers(request.headers), request.method)
        if ("refused" in verified) return HttpServerResponse.fromWeb(verified.refused)
        const claims = yield* Schema.decodeUnknownEffect(Claims)(verified.claims).pipe(Effect.orDie)
        const consent = yield* clients.consent(claims.azp, claims.sub)
        if (Option.isNone(consent)) return HttpServerResponse.fromWeb(yield* challenge(request.method))
        const actor = new Actor.Actor({
          channel: {
            _tag: "Mcp",
            clientId: claims.azp,
            clientName: Option.getOrElse(consent.value.name, () => claims.azp)
          },
          agent: Option.none()
        })
        return yield* Effect.provideService(httpEffect, Actor.CurrentActor, actor)
      })
  })
)

/** The connector, with the consents it checks read through global's own repository. */
export const connector = {
  layer: middleware.layer.pipe(Layer.provide(OAuthClientRepository.OAuthClientRepository.layer))
}
