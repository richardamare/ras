import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as OAuth from "../oauth/OAuth.ts"

/** Personal Microsoft accounts sign in through the consumers tenant. */
const authority = "https://login.microsoftonline.com/consumers/oauth2/v2.0"

export const provider: OAuth.Provider = {
  name: "graph",
  label: "Outlook",
  signIn: "Microsoft",
  authorize: `${authority}/authorize`,
  token: `${authority}/token`,
  scope: "openid email offline_access https://graph.microsoft.com/Calendars.ReadWrite",
  authorizeParams: { response_mode: "query", prompt: "select_account" },
  scopeOnGrant: true,
  clientId: "RAS_GRAPH_CLIENT_ID",
  clientSecret: "RAS_GRAPH_CLIENT_SECRET",
  callbackPath: "/graph/callback"
}

/** The owner's Outlook account, whose calendars Graph writes. */
export class Graph extends Context.Service<Graph, OAuth.Service>()("@ras/global/Graph") {}

export const make = OAuth.make(provider)

export const layer = Layer.effect(Graph, Effect.orDie(make)).pipe(Layer.provide(FetchHttpClient.layer))

export const routes = OAuth.routes(Graph, provider)
