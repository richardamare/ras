import * as Context from "effect/Context"
import type * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as Sql from "@ras/kernel/Sql"
import * as Writes from "../audit/Writes.ts"

export interface SealedTokens {
  readonly access: string
  readonly refresh: string
  readonly expires: string
}

/** The Outlook connection's tokens, sealed as `Graph` stores them. */
export interface StoredTokens {
  readonly account: string
  readonly access: string
  readonly refresh: string
  readonly expires: DateTime.Utc
  readonly connected: DateTime.Utc
}

/** A started connection: the PKCE verifier and when the attempt expires. */
export interface Attempt {
  readonly verifier: string
  readonly expires: string
}

const TokensRow = Schema.Struct({
  account: Schema.String,
  access: Schema.String,
  refresh: Schema.String,
  expires: Schema.DateTimeUtcFromString,
  connected: Schema.DateTimeUtcFromString
})
type TokensRow = typeof TokensRow.Type

const toStoredTokens = (row: TokensRow): StoredTokens => ({
  account: row.account,
  access: row.access,
  refresh: row.refresh,
  expires: row.expires,
  connected: row.connected
})

const AttemptRow = Schema.Struct({ verifier: Schema.String, expires: Schema.String })
type AttemptRow = typeof AttemptRow.Type

const toAttempt = (row: AttemptRow): Attempt => ({ verifier: row.verifier, expires: row.expires })

export class GraphTokenRepository extends Context.Service<
  GraphTokenRepository,
  {
    readonly tokens: Effect.Effect<Option.Option<StoredTokens>>
    readonly connect: (
      account: string,
      tokens: SealedTokens,
      at: string
    ) => Effect.Effect<void, never, Writes.Transaction>
    /** A refresh keeps the connection; it is ras renewing what the owner granted, so it is not audited. */
    readonly refresh: (tokens: SealedTokens) => Effect.Effect<void>
    /** Records a started connection, dropping those that expired. */
    readonly startAttempt: (state: string, verifier: string, expires: string, now: string) => Effect.Effect<void>
    /** Takes a started connection by its state, once; a second take finds nothing. */
    readonly takeAttempt: (state: string) => Effect.Effect<Option.Option<Attempt>>
  }
>()("@ras/global/GraphTokenRepository") {
  static readonly layer = Layer.effect(
    GraphTokenRepository,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return GraphTokenRepository.of({
        tokens: Sql.rows(
          TokensRow,
          sql`
            SELECT account, access_token AS access, refresh_token AS refresh, expires_at AS expires, connected_at AS connected
            FROM global_graph_tokens WHERE id = 1`
        ).pipe(Effect.map((found) => Option.map(Sql.first(found), toStoredTokens))),

        connect: (account, tokens, at) =>
          Writes.write(
            sql`
              INSERT INTO global_graph_tokens (id, account, access_token, refresh_token, expires_at, connected_at)
              VALUES (1, ${account}, ${tokens.access}, ${tokens.refresh}, ${tokens.expires}, ${at})
              ON CONFLICT (id) DO UPDATE SET
                account = excluded.account, access_token = excluded.access_token, refresh_token = excluded.refresh_token,
                expires_at = excluded.expires_at, connected_at = excluded.connected_at`.pipe(
              Effect.asVoid,
              Effect.orDie
            )
          ),

        refresh: (tokens) =>
          sql`
            UPDATE global_graph_tokens
            SET access_token = ${tokens.access}, refresh_token = ${tokens.refresh}, expires_at = ${tokens.expires}
            WHERE id = 1`.pipe(Effect.asVoid, Effect.orDie),

        startAttempt: (state, verifier, expires, now) =>
          Effect.andThen(
            sql`DELETE FROM global_graph_attempts WHERE expires_at < ${now}`,
            sql`INSERT INTO global_graph_attempts (state, verifier, expires_at) VALUES (${state}, ${verifier}, ${expires})`
          ).pipe(Effect.asVoid, Effect.orDie),

        takeAttempt: (state) =>
          Sql.rows(
            AttemptRow,
            sql`DELETE FROM global_graph_attempts WHERE state = ${state} RETURNING verifier, expires_at AS expires`
          ).pipe(Effect.map((found) => Option.map(Sql.first(found), toAttempt)))
      })
    })
  )
}
