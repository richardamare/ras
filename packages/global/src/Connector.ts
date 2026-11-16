import * as BetterAuthMcp from "@better-auth/mcp"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpServerRequest from "effect/http/HttpServerRequest"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as SqlClient from "effect/sql/SqlClient"
import * as Actor from "./Actor.ts"
import * as Auth from "./Auth.ts"

const Claims = Schema.Struct({ sub: Schema.String, azp: Schema.String })

/**
 * Admits a request to `/mcp` that carries an access token ras issued for it, and runs it as the owner through the
 * client the token names. Without a valid token it answers better-auth's 401 challenge, which points the client at
 * the sign-in.
 */
export const middleware = HttpRouter.middleware<{ provides: Actor.CurrentActor }>()(
  Effect.gen(function* () {
    const auth = yield* Auth.Auth
    const sql = yield* SqlClient.SqlClient
    const settings = yield* Auth.settings
    const resource = new URL(Auth.mcpPath, settings.url).href

    const verify = (request: HttpServerRequest.HttpServerRequest) =>
      Effect.promise(async () => {
        let claims: unknown
        const response = await BetterAuthMcp.requireMcpAuth(
          auth,
          (_request, verified) => {
            claims = verified
            return new Response(null, { status: 204 })
          },
          { resource }
        )(new Request(resource, { method: request.method, headers: new Headers(request.headers) }))
        return claims === undefined ? { refused: response } : { claims }
      })

    const clientName = (clientId: string) =>
      sql<{ name: string | null }>`SELECT name FROM global_oauth_clients WHERE clientId = ${clientId}`.pipe(
        Effect.map((rows) => rows[0]?.name ?? clientId),
        Effect.orDie
      )

    return (httpEffect) =>
      Effect.gen(function* () {
        const verified = yield* verify(yield* HttpServerRequest.HttpServerRequest)
        if ("refused" in verified) return HttpServerResponse.fromWeb(verified.refused)
        const claims = yield* Schema.decodeUnknownEffect(Claims)(verified.claims).pipe(Effect.orDie)
        const actor = new Actor.Actor({
          channel: { _tag: "Mcp", clientId: claims.azp, clientName: yield* clientName(claims.azp) },
          agent: Option.none()
        })
        return yield* Effect.provideService(httpEffect, Actor.CurrentActor, actor)
      })
  })
)
