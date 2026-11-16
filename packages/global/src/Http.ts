import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as HttpApi from "effect/http-api/HttpApi"
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder"
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint"
import * as HttpApiError from "effect/http-api/HttpApiError"
import * as HttpApiGroup from "effect/http-api/HttpApiGroup"
import * as HttpApiMiddleware from "effect/http-api/HttpApiMiddleware"
import * as Module from "@ras/kernel/Module"
import * as Actor from "./Actor.ts"

export class Authenticated extends HttpApiMiddleware.Service<Authenticated, { provides: Actor.CurrentActor }>()(
  "@ras/global/Authenticated",
  { error: HttpApiError.Unauthorized }
) {}

/**
 * The one-group API a module builds its handlers against. apps/api applies `Authenticated` to the composed API the
 * same way, so every endpoint requires the owner's session and a handler may read `CurrentActor`.
 */
export const api = <const Group extends HttpApiGroup.Constraint>(group: Group) =>
  HttpApi.make(Module.apiId).add(group).middleware(Authenticated)

export const Me = Schema.Struct({ channel: Schema.String, agent: Schema.NullOr(Schema.String) })

export const group = HttpApiGroup.make("global")
  .add(HttpApiEndpoint.get("whoami", "/me", { success: Me }))
  .prefix("/global")

export const me = Effect.map(Effect.service(Actor.CurrentActor), (actor) => ({
  channel: actor.channel._tag,
  agent: Option.getOrNull(actor.agent)
}))

export const handlers = HttpApiBuilder.group(api(group), "global", (endpoints) => endpoints.handle("whoami", () => me))
