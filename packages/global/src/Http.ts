import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as HttpApi from "effect/http-api/HttpApi"
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder"
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint"
import * as HttpApiError from "effect/http-api/HttpApiError"
import * as HttpApiGroup from "effect/http-api/HttpApiGroup"
import * as HttpApiMiddleware from "effect/http-api/HttpApiMiddleware"
import * as Connections from "@ras/kernel/Connections"
import * as Errors from "@ras/kernel/Errors"
import * as Module from "@ras/kernel/Module"
import * as Actor from "./audit/Actor.ts"
import * as Agents from "./agents/Agents.ts"
import * as Client from "./auth/Client.ts"
import * as Clients from "./auth/Clients.ts"
import * as Google from "./google/Google.ts"
import * as Graph from "./graph/Graph.ts"
import * as OAuth from "./oauth/OAuth.ts"
import * as Agent from "./agents/Agent.ts"

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
  .add(HttpApiEndpoint.get("agents", "/agents", { success: Schema.Array(Agent.Agent) }))
  .add(
    HttpApiEndpoint.post("addAgent", "/agents", {
      payload: Schema.Struct({ slug: Actor.AgentSlug, name: Schema.String.check(Schema.isNonEmpty()) }),
      success: Agent.Agent,
      error: Errors.Refused
    })
  )
  .add(
    HttpApiEndpoint.post("archiveAgent", "/agents/:slug/archive", {
      params: { slug: Actor.AgentSlug },
      success: Agent.Agent,
      error: Errors.NotFound
    })
  )
  .add(
    HttpApiEndpoint.get("graph", "/graph", {
      success: Schema.NullOr(OAuth.Connection).annotate({ description: "The Outlook account connected, if any." })
    })
  )
  .add(
    HttpApiEndpoint.post("connectGraph", "/graph/connect", {
      success: Schema.Struct({ url: Schema.String.annotate({ description: "Open it to sign in to Microsoft." }) }),
      error: Errors.Refused
    })
  )
  .add(
    HttpApiEndpoint.get("google", "/google", {
      success: Schema.NullOr(OAuth.Connection).annotate({ description: "The Google account connected, if any." })
    })
  )
  .add(
    HttpApiEndpoint.post("connectGoogle", "/google/connect", {
      success: Schema.Struct({ url: Schema.String.annotate({ description: "Open it to sign in to Google." }) }),
      error: Errors.Refused
    })
  )
  .add(
    HttpApiEndpoint.get("connections", "/connections", {
      success: Schema.Array(Connections.Connection).annotate({
        description:
          "Outlook, Google, Reclaim, iCloud Mail and GitHub, each in the state its settings give, without reaching it."
      })
    })
  )
  .add(
    HttpApiEndpoint.post("checkConnection", "/connections/:kind/check", {
      params: { kind: Connections.Kind },
      success: Connections.Connection.annotate({ description: "The state after reaching it with its cheapest read." })
    })
  )
  .add(HttpApiEndpoint.get("clients", "/clients", { success: Schema.Array(Client.Client) }))
  .add(
    HttpApiEndpoint.post("revokeClient", "/clients/:id/revoke", {
      params: { id: Schema.String },
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
    const graph = yield* Graph.Graph
    const google = yield* Google.Google
    const clients = yield* Clients.Clients
    const connections = yield* Connections.Connections
    return endpoints
      .handle("graph", () => Effect.map(graph.connection, Option.getOrNull))
      .handle("connectGraph", () => Effect.map(graph.connect, (url) => ({ url: url.href })))
      .handle("google", () => Effect.map(google.connection, Option.getOrNull))
      .handle("connectGoogle", () => Effect.map(google.connect, (url) => ({ url: url.href })))
      .handle("connections", () => connections.list)
      .handle("checkConnection", ({ params }) => connections.check(params.kind))
      .handle("whoami", () => me)
      .handle("agents", () => agents.list)
      .handle("addAgent", ({ payload }) => agents.add(payload.slug, payload.name))
      .handle("archiveAgent", ({ params }) => agents.archive(params.slug))
      .handle("clients", () => clients.list)
      .handle("revokeClient", ({ params }) => clients.revoke(params.id))
  })
)
