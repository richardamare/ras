import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as HttpApi from "effect/http-api/HttpApi"
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder"
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint"
import * as HttpApiError from "effect/http-api/HttpApiError"
import * as HttpApiGroup from "effect/http-api/HttpApiGroup"
import * as HttpApiMiddleware from "effect/http-api/HttpApiMiddleware"
import * as Errors from "@ras/kernel/Errors"
import * as Module from "@ras/kernel/Module"
import * as Actor from "./Actor.ts"
import * as Agents from "./Agents.ts"
import * as Store from "./Store.ts"

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
  .add(HttpApiEndpoint.get("agents", "/agents", { success: Schema.Array(Store.Agent) }))
  .add(
    HttpApiEndpoint.post("addAgent", "/agents", {
      payload: Schema.Struct({ slug: Actor.AgentSlug, name: Schema.String.check(Schema.isNonEmpty()) }),
      success: Store.Agent,
      error: Errors.Refused
    })
  )
  .add(
    HttpApiEndpoint.post("archiveAgent", "/agents/:slug/archive", {
      params: { slug: Actor.AgentSlug },
      success: Store.Agent,
      error: Errors.NotFound
    })
  )
  .prefix("/global")

export const me = Effect.map(Effect.service(Actor.CurrentActor), (actor) => ({
  channel: actor.channel._tag,
  agent: Option.getOrNull(actor.agent)
}))

export const handlers = HttpApiBuilder.group(api(group), "global", (endpoints) =>
  Effect.gen(function* () {
    const agents = yield* Agents.Agents
    return endpoints
      .handle("whoami", () => me)
      .handle("agents", () => agents.list)
      .handle("addAgent", ({ payload }) => agents.add(payload.slug, payload.name))
      .handle("archiveAgent", ({ params }) => agents.archive(params.slug))
  })
)
