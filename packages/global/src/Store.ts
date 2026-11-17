import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as Actor from "./Actor.ts"
import * as Writes from "./Writes.ts"

export class Agent extends Schema.Class<Agent>("Agent")({
  slug: Actor.AgentSlug,
  name: Schema.String,
  archived: Schema.Boolean
}) {}

const Row = Schema.Struct({ slug: Actor.AgentSlug, name: Schema.String, archived: Schema.BooleanFromBit })

const decode = Schema.decodeUnknownEffect(Schema.Array(Row))

const agentsWhere = (slug: Option.Option<string>) =>
  SqlClient.SqlClient.use(
    (sql) => sql`
      SELECT slug, name, archived_at IS NOT NULL AS archived FROM global_agents
      ${Option.match(slug, { onNone: () => sql``, onSome: (one) => sql`WHERE slug = ${one}` })}
      ORDER BY slug`
  ).pipe(
    Effect.flatMap(decode),
    Effect.map((rows) => rows.map((row) => new Agent(row))),
    Effect.orDie
  )

export const agents = agentsWhere(Option.none())

export const agent = (slug: string) =>
  Effect.map(agentsWhere(Option.some(slug)), (rows) => Option.fromUndefinedOr(rows[0]))

export const insert = (added: { readonly slug: Actor.AgentSlug; readonly name: string }) =>
  Writes.write(
    SqlClient.SqlClient.use(
      (sql) => sql`INSERT INTO global_agents (slug, name) VALUES (${added.slug}, ${added.name})`
    ).pipe(Effect.orDie)
  )

export const archive = (slug: Actor.AgentSlug, at: string) =>
  Writes.write(
    SqlClient.SqlClient.use(
      (sql) => sql`UPDATE global_agents SET archived_at = ${at} WHERE slug = ${slug} AND archived_at IS NULL`
    ).pipe(Effect.orDie)
  )

const GraphTokensRow = Schema.Struct({
  account: Schema.String,
  access: Schema.String,
  refresh: Schema.String,
  expires: Schema.DateTimeUtcFromString,
  connected: Schema.DateTimeUtcFromString
})

/** The Outlook connection's tokens, sealed as `Graph` stores them. */
export const graphTokens = SqlClient.SqlClient.use(
  (sql) => sql`
    SELECT account, access_token AS access, refresh_token AS refresh, expires_at AS expires, connected_at AS connected
    FROM global_graph_tokens WHERE id = 1`
).pipe(
  Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(GraphTokensRow))),
  Effect.map((rows) => Option.fromUndefinedOr(rows[0])),
  Effect.orDie
)

export interface SealedTokens {
  readonly access: string
  readonly refresh: string
  readonly expires: string
}

export const connectGraph = (account: string, tokens: SealedTokens, at: string) =>
  Writes.write(
    SqlClient.SqlClient.use(
      (sql) => sql`
        INSERT INTO global_graph_tokens (id, account, access_token, refresh_token, expires_at, connected_at)
        VALUES (1, ${account}, ${tokens.access}, ${tokens.refresh}, ${tokens.expires}, ${at})
        ON CONFLICT (id) DO UPDATE SET
          account = excluded.account, access_token = excluded.access_token, refresh_token = excluded.refresh_token,
          expires_at = excluded.expires_at, connected_at = excluded.connected_at`
    ).pipe(Effect.orDie)
  )

/** A refresh keeps the connection; it is ras renewing what the owner granted, so it is not audited. */
export const refreshGraph = (tokens: SealedTokens) =>
  SqlClient.SqlClient.use(
    (sql) => sql`
      UPDATE global_graph_tokens
      SET access_token = ${tokens.access}, refresh_token = ${tokens.refresh}, expires_at = ${tokens.expires}
      WHERE id = 1`
  ).pipe(Effect.asVoid, Effect.orDie)

/** Records a started connection, dropping those that expired. */
export const startGraphAttempt = (state: string, verifier: string, expires: string, now: string) =>
  SqlClient.SqlClient.use((sql) =>
    Effect.andThen(
      sql`DELETE FROM global_graph_attempts WHERE expires_at < ${now}`,
      sql`INSERT INTO global_graph_attempts (state, verifier, expires_at) VALUES (${state}, ${verifier}, ${expires})`
    )
  ).pipe(Effect.asVoid, Effect.orDie)

/** Takes a started connection by its state, once; a second take finds nothing. */
export const takeGraphAttempt = (state: string) =>
  SqlClient.SqlClient.use(
    (sql) => sql<{ readonly verifier: string; readonly expires: string }>`
      DELETE FROM global_graph_attempts WHERE state = ${state} RETURNING verifier, expires_at AS expires`
  ).pipe(
    Effect.map((rows) => Option.fromUndefinedOr(rows[0])),
    Effect.orDie
  )

const ClientRow = Schema.Struct({
  id: Schema.String,
  name: Schema.NullOr(Schema.String),
  scopes: Schema.fromJsonString(Schema.Array(Schema.String)),
  connected: Schema.DateTimeUtcFromString,
  used: Schema.NullOr(Schema.DateTimeUtcFromString)
})

/** The MCP clients the owner consented to, newest first, with when each last renewed its access. */
export const consentedClients = SqlClient.SqlClient.use(
  (sql) => sql`
    SELECT c.clientId AS id, k.name, c.scopes, MIN(c.createdAt) AS connected,
           (SELECT MAX(t.createdAt) FROM global_oauth_refresh_tokens t WHERE t.clientId = c.clientId) AS used
    FROM global_oauth_consents c
    LEFT JOIN global_oauth_clients k ON k.clientId = c.clientId
    GROUP BY c.clientId
    ORDER BY connected DESC`
).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(ClientRow))), Effect.orDie)

/** The name of a client the owner `user` consented to; none for a client without a consent. */
export const consentedClient = (clientId: string, user: string) =>
  SqlClient.SqlClient.use(
    (sql) => sql<{ readonly name: string | null }>`
      SELECT k.name FROM global_oauth_consents c
      LEFT JOIN global_oauth_clients k ON k.clientId = c.clientId
      WHERE c.clientId = ${clientId} AND c.userId = ${user}
      LIMIT 1`
  ).pipe(
    Effect.map((rows) => Option.map(Option.fromUndefinedOr(rows[0]), (row) => row.name ?? clientId)),
    Effect.orDie
  )

/**
 * Drops a client's consents and stored access tokens and revokes its refresh tokens, so it signs in and consents
 * again. A JWT access token stays valid until it expires; the connector refuses it once the consent is gone.
 */
export const revokeClient = (clientId: string, at: string) =>
  Writes.write(
    SqlClient.SqlClient.use((sql) =>
      Effect.all([
        sql`DELETE FROM global_oauth_consents WHERE clientId = ${clientId}`,
        sql`DELETE FROM global_oauth_access_tokens WHERE clientId = ${clientId}`,
        sql`UPDATE global_oauth_refresh_tokens SET revoked = ${at} WHERE clientId = ${clientId} AND revoked IS NULL`
      ])
    ).pipe(Effect.asVoid, Effect.orDie)
  )
