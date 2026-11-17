import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as Errors from "@ras/kernel/Errors"
import * as Time from "@ras/kernel/Time"
import type * as Actor from "./Actor.ts"
import * as Store from "./Store.ts"
import * as Writes from "./Writes.ts"

export class Client extends Schema.Class<Client>("McpClient")({
  id: Schema.String,
  name: Schema.String,
  scopes: Schema.Array(Schema.String),
  connected: Time.PragueLocal,
  used: Schema.NullOr(Time.PragueLocal).annotate({ description: "When it last renewed its access." })
}) {}

/** The MCP clients the owner connected through the consent page. */
export class Clients extends Context.Service<
  Clients,
  {
    readonly list: Effect.Effect<ReadonlyArray<Client>>
    /** Cuts the client off at once: its tokens stop working and it has to sign in and consent again. */
    readonly revoke: (id: string) => Effect.Effect<void, Errors.NotFound, Actor.CurrentActor>
  }
>()("@ras/global/Clients") {
  static readonly layer = Layer.effect(
    Clients,
    Effect.gen(function* () {
      const writes = yield* Writes.Writes
      const sql = yield* SqlClient.SqlClient
      const store = Effect.provideService(SqlClient.SqlClient, sql)

      const list = Effect.map(store(Store.consentedClients), (rows) =>
        rows.map(
          (row) =>
            new Client({
              id: row.id,
              name: row.name ?? row.id,
              scopes: row.scopes,
              connected: Time.toPragueLocal(row.connected),
              used: row.used === null ? null : Time.toPragueLocal(row.used)
            })
        )
      )

      return Clients.of({
        list,
        revoke: (id) =>
          Effect.gen(function* () {
            const found = (yield* list).find((client) => client.id === id)
            if (found === undefined) return yield* new Errors.NotFound({ subject: "client", id })
            const at = DateTime.formatIso(yield* DateTime.now)
            yield* writes.run(
              "global.client.revoked",
              store(Store.revokeClient(id, at)).pipe(
                Effect.as({
                  result: undefined,
                  subject: `client/${id}`,
                  before: Option.some({ name: found.name, scopes: found.scopes }),
                  after: Option.none()
                })
              )
            )
          })
      })
    })
  )
}
