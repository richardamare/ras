import * as BetterAuthMcp from "@better-auth/mcp"
import * as BetterAuth from "better-auth"
import * as BetterAuthMigration from "better-auth/db/migration"
import * as BetterAuthPlugins from "better-auth/plugins"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as AuthDatabase from "./AuthDatabase.ts"

export const basePath = "/auth"
export const mcpPath = "/mcp"
export const signInPage = "/sign-in"
export const consentPage = "/consent"

/** What a client may ask for, and what a client that registers without naming scopes gets. */
const scopes = ["openid", "profile", "email", "offline_access"]

export interface Settings {
  readonly url: URL
  readonly secret: Redacted.Redacted
}

export const settings: Config.Config<Settings> = Config.all({
  url: Config.URL("RAS_URL"),
  secret: Config.Redacted("RAS_AUTH_SECRET")
})

const table = (plural: string) => ({ modelName: `global_${plural}` })

/**
 * better-auth for the one owner: email and password with sign-up closed, so the only account is the one
 * `ras owner` creates, and the OAuth 2.1 authorization server that MCP clients sign in through.
 */
export const make = (options: {
  readonly settings: Settings
  readonly database: BetterAuth.BetterAuthOptions["database"]
}) =>
  BetterAuth.betterAuth({
    appName: "ras",
    database: options.database,
    secret: Redacted.value(options.settings.secret),
    baseURL: new URL(basePath, options.settings.url).href,
    basePath,
    trustedOrigins: [options.settings.url.origin],
    emailAndPassword: { enabled: true, disableSignUp: true },
    telemetry: { enabled: false },
    advanced: { useSecureCookies: options.settings.url.protocol === "https:" },
    user: table("users"),
    session: table("sessions"),
    account: table("accounts"),
    verification: { ...table("verifications"), storeInDatabase: true },
    plugins: [
      BetterAuthPlugins.jwt({ disableSettingJwtHeader: true, schema: { jwks: table("jwks") } }),
      BetterAuthMcp.mcp({
        resource: new URL(mcpPath, options.settings.url).href,
        loginPage: signInPage,
        consentPage,
        scopes,
        clientRegistrationDefaultScopes: scopes,
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultApplicationType: "infer",
        accessTokenExpiresIn: 15 * 60,
        schema: {
          oauthClient: table("oauth_clients"),
          oauthResource: table("oauth_resources"),
          oauthClientResource: table("oauth_client_resources"),
          oauthAccessToken: table("oauth_access_tokens"),
          oauthRefreshToken: table("oauth_refresh_tokens"),
          oauthConsent: table("oauth_consents"),
          oauthClientAssertion: table("oauth_client_assertions")
        }
      })
    ]
  })

export type Instance = ReturnType<typeof make>

/** better-auth over the Effect SQLite client. Never call it inside `Writes.run`: it waits for the connection that write holds. */
export class Auth extends Context.Service<Auth, Instance>()("@ras/global/Auth") {
  static readonly layer = Layer.effect(
    Auth,
    Effect.gen(function* () {
      const database = yield* AuthDatabase.dialect
      return make({ settings: yield* settings, database: { dialect: database, type: "sqlite", transaction: true } })
    })
  )
}

/** The SQL better-auth would run to bring the connected database up to its schema; empty when it is current. */
export const schemaSql = Effect.gen(function* () {
  const dialect = yield* AuthDatabase.dialect
  const auth = make({
    settings: { url: new URL("http://localhost"), secret: Redacted.make("x".repeat(32)) },
    database: { dialect, type: "sqlite", transaction: true }
  })
  const migrations = yield* Effect.promise(() => BetterAuthMigration.getMigrations(auth.options))
  return yield* Effect.promise(() => migrations.compileMigrations())
})
