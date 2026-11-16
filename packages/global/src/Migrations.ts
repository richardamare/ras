import * as Effect from "effect/Effect"
import * as SqlClient from "effect/sql/SqlClient"
import type * as Module from "@ras/kernel/Module"

/** better-auth's tables, as `Auth.schemaSql` printed them for better-auth 1.7.25. */
const signIn = [
  `create table "global_users" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null)`,
  `create table "global_sessions" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "global_users" ("id") on delete cascade)`,
  `create table "global_accounts" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "global_users" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null)`,
  `create table "global_verifications" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null)`,
  `create table "global_jwks" ("id" text not null primary key, "publicKey" text not null, "privateKey" text not null, "createdAt" date not null, "expiresAt" date, "alg" text, "crv" text)`,
  `create table "global_oauth_clients" ("id" text not null primary key, "clientId" text not null unique, "clientSecret" text, "clientDiscoveryId" text, "disabled" integer, "skipConsent" integer, "enableEndSession" integer, "subjectType" text, "scopes" text, "clientCredentialsScopes" text, "userId" text references "global_users" ("id") on delete cascade, "createdAt" date, "updatedAt" date, "name" text, "uri" text, "icon" text, "contacts" text, "tos" text, "policy" text, "softwareId" text, "softwareVersion" text, "softwareStatement" text, "redirectUris" text not null, "postLogoutRedirectUris" text, "backchannelLogoutUri" text, "backchannelLogoutSessionRequired" integer, "tokenEndpointAuthMethod" text, "applicationType" text, "jwks" text, "jwksUri" text, "grantTypes" text, "responseTypes" text, "requirePKCE" integer, "dpopBoundAccessTokens" integer, "referenceId" text, "metadata" text)`,
  `create table "global_oauth_resources" ("id" text not null primary key, "identifier" text not null unique, "name" text not null, "accessTokenTtl" integer, "refreshTokenTtl" integer, "signingAlgorithm" text, "signingKeyId" text, "allowedScopes" text, "customClaims" text, "dpopBoundAccessTokensRequired" integer, "disabled" integer, "createdAt" date, "updatedAt" date, "policyVersion" integer, "metadata" text)`,
  `create table "global_oauth_client_resources" ("id" text not null primary key, "clientId" text not null references "global_oauth_clients" ("clientId") on delete cascade, "resourceId" text not null references "global_oauth_resources" ("identifier") on delete cascade, "metadata" text, "createdAt" date)`,
  `create table "global_oauth_refresh_tokens" ("id" text not null primary key, "token" text not null unique, "clientId" text not null references "global_oauth_clients" ("clientId") on delete cascade, "sessionId" text references "global_sessions" ("id") on delete set null, "userId" text not null references "global_users" ("id") on delete cascade, "referenceId" text, "authorizationCodeId" text, "resources" text, "requestedUserInfoClaims" text, "expiresAt" date not null, "createdAt" date not null, "revoked" date, "rotatedAt" date, "rotationReplayResponse" text, "rotationReplayExpiresAt" date, "authTime" date, "confirmation" text, "scopes" text not null)`,
  `create table "global_oauth_access_tokens" ("id" text not null primary key, "token" text not null unique, "clientId" text not null references "global_oauth_clients" ("clientId") on delete cascade, "sessionId" text references "global_sessions" ("id") on delete set null, "userId" text references "global_users" ("id") on delete cascade, "referenceId" text, "authorizationCodeId" text, "resources" text, "requestedUserInfoClaims" text, "refreshId" text references "global_oauth_refresh_tokens" ("id") on delete cascade, "expiresAt" date not null, "createdAt" date not null, "revoked" date, "confirmation" text, "scopes" text not null)`,
  `create table "global_oauth_consents" ("id" text not null primary key, "clientId" text not null references "global_oauth_clients" ("clientId") on delete cascade, "userId" text references "global_users" ("id") on delete cascade, "referenceId" text, "resources" text, "requestedUserInfoClaims" text, "scopes" text not null, "createdAt" date not null, "updatedAt" date not null)`,
  `create table "global_oauth_client_assertions" ("id" text not null primary key, "expiresAt" date not null)`,
  `create index "global_sessions_userId_idx" on "global_sessions" ("userId")`,
  `create index "global_accounts_userId_idx" on "global_accounts" ("userId")`,
  `create index "global_verifications_identifier_idx" on "global_verifications" ("identifier")`,
  `create index "global_oauth_clients_userId_idx" on "global_oauth_clients" ("userId")`,
  `create index "global_oauth_client_resources_clientId_idx" on "global_oauth_client_resources" ("clientId")`,
  `create index "global_oauth_client_resources_resourceId_idx" on "global_oauth_client_resources" ("resourceId")`,
  `create index "global_oauth_refresh_tokens_clientId_idx" on "global_oauth_refresh_tokens" ("clientId")`,
  `create index "global_oauth_refresh_tokens_sessionId_idx" on "global_oauth_refresh_tokens" ("sessionId")`,
  `create index "global_oauth_refresh_tokens_userId_idx" on "global_oauth_refresh_tokens" ("userId")`,
  `create index "global_oauth_refresh_tokens_authorizationCodeId_idx" on "global_oauth_refresh_tokens" ("authorizationCodeId")`,
  `create index "global_oauth_access_tokens_clientId_idx" on "global_oauth_access_tokens" ("clientId")`,
  `create index "global_oauth_access_tokens_sessionId_idx" on "global_oauth_access_tokens" ("sessionId")`,
  `create index "global_oauth_access_tokens_userId_idx" on "global_oauth_access_tokens" ("userId")`,
  `create index "global_oauth_access_tokens_authorizationCodeId_idx" on "global_oauth_access_tokens" ("authorizationCodeId")`,
  `create index "global_oauth_access_tokens_refreshId_idx" on "global_oauth_access_tokens" ("refreshId")`,
  `create index "global_oauth_consents_clientId_idx" on "global_oauth_consents" ("clientId")`,
  `create index "global_oauth_consents_userId_idx" on "global_oauth_consents" ("userId")`,
  `create unique index "global_oauth_client_resources_clientId_resourceId_uidx" on "global_oauth_client_resources" ("clientId", "resourceId")`
]

export const migrations: Module.Migrations = {
  "0001_create_audit": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      CREATE TABLE global_audit_entries (
        id INTEGER PRIMARY KEY,
        action TEXT NOT NULL,
        subject TEXT NOT NULL,
        before TEXT,
        after TEXT,
        channel TEXT NOT NULL,
        agent TEXT,
        at TEXT NOT NULL
      ) STRICT`
    yield* sql`CREATE TRIGGER global_audit_entries_no_update BEFORE UPDATE ON global_audit_entries BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END`
    yield* sql`CREATE TRIGGER global_audit_entries_no_delete BEFORE DELETE ON global_audit_entries BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END`
  }),
  "0002_create_sign_in": SqlClient.SqlClient.use((sql) =>
    Effect.forEach(signIn, (statement) => sql.unsafe(statement), { discard: true })
  )
}
