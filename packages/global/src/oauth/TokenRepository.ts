import type * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
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

/** A connection's tokens, sealed as `OAuth` stores them. */
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

export interface TokenRepository {
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

const TokensRow = Schema.Struct({
  account: Schema.String,
  access: Schema.String,
  refresh: Schema.String,
  expires: Schema.DateTimeUtcFromString,
  connected: Schema.DateTimeUtcFromString
})

const AttemptRow = Schema.Struct({ verifier: Schema.String, expires: Schema.String })

/** The one connection of `name` in `global_<name>_tokens`, and its started attempts in `global_<name>_attempts`. */
export const make = (name: string) =>
  Effect.map(Effect.service(SqlClient.SqlClient), (sql): TokenRepository => {
    const tokens = sql(`global_${name}_tokens`)
    const attempts = sql(`global_${name}_attempts`)
    return {
      tokens: Sql.rows(
        TokensRow,
        sql`
            SELECT account, access_token AS access, refresh_token AS refresh, expires_at AS expires, connected_at AS connected
            FROM ${tokens} WHERE id = 1`
      ).pipe(Effect.map(Sql.first)),

      connect: (account, sealed, at) =>
        Writes.write(
          sql`
              INSERT INTO ${tokens} (id, account, access_token, refresh_token, expires_at, connected_at)
              VALUES (1, ${account}, ${sealed.access}, ${sealed.refresh}, ${sealed.expires}, ${at})
              ON CONFLICT (id) DO UPDATE SET
                account = excluded.account, access_token = excluded.access_token, refresh_token = excluded.refresh_token,
                expires_at = excluded.expires_at, connected_at = excluded.connected_at`.pipe(
            Effect.asVoid,
            Effect.orDie
          )
        ),

      refresh: (sealed) =>
        sql`
            UPDATE ${tokens}
            SET access_token = ${sealed.access}, refresh_token = ${sealed.refresh}, expires_at = ${sealed.expires}
            WHERE id = 1`.pipe(Effect.asVoid, Effect.orDie),

      startAttempt: (state, verifier, expires, now) =>
        Effect.andThen(
          sql`DELETE FROM ${attempts} WHERE expires_at < ${now}`,
          sql`INSERT INTO ${attempts} (state, verifier, expires_at) VALUES (${state}, ${verifier}, ${expires})`
        ).pipe(Effect.asVoid, Effect.orDie),

      takeAttempt: (state) =>
        Sql.rows(
          AttemptRow,
          sql`DELETE FROM ${attempts} WHERE state = ${state} RETURNING verifier, expires_at AS expires`
        ).pipe(Effect.map(Sql.first))
    }
  })

export const tablesOf = (name: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      CREATE TABLE ${sql(`global_${name}_tokens`)} (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        account TEXT NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        connected_at TEXT NOT NULL
      ) STRICT`
    yield* sql`
      CREATE TABLE ${sql(`global_${name}_attempts`)} (
        state TEXT PRIMARY KEY,
        verifier TEXT NOT NULL,
        expires_at TEXT NOT NULL
      ) STRICT`
  })
