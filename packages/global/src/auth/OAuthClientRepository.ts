import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as Sql from "@ras/kernel/Sql"
import * as Time from "@ras/kernel/Time"
import * as Client from "./Client.ts"
import * as Writes from "../audit/Writes.ts"

const ClientRow = Schema.Struct({
  id: Schema.String,
  name: Schema.NullOr(Schema.String),
  scopes: Schema.fromJsonString(Schema.Array(Schema.String)),
  connected: Schema.DateTimeUtcFromString,
  used: Schema.NullOr(Schema.DateTimeUtcFromString)
})
type ClientRow = typeof ClientRow.Type

const toClient = (row: ClientRow): Client.Client =>
  new Client.Client({
    id: row.id,
    name: row.name ?? row.id,
    scopes: row.scopes,
    connected: Time.toPragueLocal(row.connected),
    used: row.used === null ? null : Time.toPragueLocal(row.used)
  })

/** The owner's consent to a client, with the name the client registered under, when it gave one. */
export interface Consent {
  readonly name: Option.Option<string>
}

const ConsentRow = Schema.Struct({ name: Schema.NullOr(Schema.String) })
type ConsentRow = typeof ConsentRow.Type

const toConsent = (row: ConsentRow): Consent => ({ name: Option.fromNullOr(row.name) })

/** The OAuth clients better-auth registered, seen through the consents the owner gave them. */
export class OAuthClientRepository extends Context.Service<
  OAuthClientRepository,
  {
    /** The MCP clients the owner consented to, newest first, with when each last renewed its access. */
    readonly consented: Effect.Effect<ReadonlyArray<Client.Client>>
    /** The owner `user`'s consent to a client; none for a client without one. */
    readonly consent: (clientId: string, user: string) => Effect.Effect<Option.Option<Consent>>
    /**
     * Drops a client's consents and stored access tokens and revokes its refresh tokens, so it signs in and consents
     * again. A JWT access token stays valid until it expires; the connector refuses it once the consent is gone.
     */
    readonly revoke: (clientId: string, at: string) => Effect.Effect<void, never, Writes.Transaction>
  }
>()("@ras/global/OAuthClientRepository") {
  static readonly layer = Layer.effect(
    OAuthClientRepository,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return OAuthClientRepository.of({
        consented: Sql.rows(
          ClientRow,
          sql`
            SELECT c.clientId AS id, k.name, c.scopes, MIN(c.createdAt) AS connected,
                   (SELECT MAX(t.createdAt) FROM global_oauth_refresh_tokens t WHERE t.clientId = c.clientId) AS used
            FROM global_oauth_consents c
            LEFT JOIN global_oauth_clients k ON k.clientId = c.clientId
            GROUP BY c.clientId
            ORDER BY connected DESC`
        ).pipe(Effect.map(Arr.map(toClient))),

        consent: (clientId, user) =>
          Sql.rows(
            ConsentRow,
            sql`
              SELECT k.name FROM global_oauth_consents c
              LEFT JOIN global_oauth_clients k ON k.clientId = c.clientId
              WHERE c.clientId = ${clientId} AND c.userId = ${user}
              LIMIT 1`
          ).pipe(Effect.map((found) => Option.map(Sql.first(found), toConsent))),

        revoke: (clientId, at) =>
          Writes.write(
            Effect.all([
              sql`DELETE FROM global_oauth_consents WHERE clientId = ${clientId}`,
              sql`DELETE FROM global_oauth_access_tokens WHERE clientId = ${clientId}`,
              sql`UPDATE global_oauth_refresh_tokens SET revoked = ${at} WHERE clientId = ${clientId} AND revoked IS NULL`
            ]).pipe(Effect.asVoid, Effect.orDie)
          )
      })
    })
  )
}
