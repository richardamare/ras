import * as OAuth from "../oauth/OAuth.ts"

/** Personal Microsoft accounts sign in through the consumers tenant. */
const authority = "https://login.microsoftonline.com/consumers/oauth2/v2.0"

const provider: OAuth.Provider = {
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
export class Graph extends OAuth.Account<Graph>()("@ras/global/Graph", provider) {}
