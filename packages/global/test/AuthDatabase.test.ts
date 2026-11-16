import { assert, layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as SqlClient from "effect/sql/SqlClient"
import * as Kysely from "kysely"
import * as Testing from "@ras/global/testing"
import * as AuthDatabase from "../src/AuthDatabase.ts"

interface Tables {
  probes: { id: string }
}

const kysely = Effect.map(AuthDatabase.dialect, (dialect) => new Kysely.Kysely<Tables>({ dialect }))

const ids = SqlClient.SqlClient.use((sql) => sql<{ id: string }>`SELECT id FROM probes ORDER BY id`).pipe(
  Effect.map((rows) => rows.map((row) => row.id))
)

layer(Testing.database([]))("AuthDatabase", (test) => {
  test.effect("commits a transaction's writes together and rolls a failed one back whole", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE probes (id TEXT PRIMARY KEY)`
      const db = yield* kysely
      yield* Effect.promise(() =>
        db.transaction().execute(async (trx) => {
          await trx.insertInto("probes").values({ id: "a" }).execute()
          await trx.insertInto("probes").values({ id: "b" }).execute()
        })
      )
      const outcome = yield* Effect.promise(() =>
        db
          .transaction()
          .execute(async (trx) => {
            await trx.insertInto("probes").values({ id: "c" }).execute()
            await trx.insertInto("probes").values({ id: "a" }).execute()
          })
          .then(
            () => "committed",
            () => "rolled back"
          )
      )
      assert.strictEqual(outcome, "rolled back")
      assert.deepStrictEqual(yield* ids, ["a", "b"])
    })
  )

  test.effect("makes an Effect write wait until a transaction commits", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const db = yield* kysely
      const order: Array<string> = []
      const held = Promise.withResolvers<void>()
      const transaction = db.transaction().execute(async (trx) => {
        await trx.insertInto("probes").values({ id: "t" }).execute()
        await held.promise
        order.push("transaction")
      })
      yield* Effect.promise(() => Bun.sleep(10))
      const write = yield* Effect.forkChild(
        sql`INSERT INTO probes VALUES ('e')`.pipe(Effect.tap(() => Effect.sync(() => order.push("effect"))))
      )
      yield* Effect.promise(() => Bun.sleep(10))
      held.resolve()
      yield* Effect.promise(() => transaction)
      yield* Fiber.join(write)
      assert.deepStrictEqual(order, ["transaction", "effect"])
      assert.deepStrictEqual(yield* ids, ["a", "b", "e", "t"])
    })
  )
})
