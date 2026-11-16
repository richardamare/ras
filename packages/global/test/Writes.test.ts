import { assert, describe, it, layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as SqlClient from "effect/sql/SqlClient"
import * as Errors from "@ras/kernel/Errors"
import * as Global from "@ras/global"
import * as Testing from "@ras/global/testing"

const count = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ n: number }>`SELECT count(*) AS n FROM global_audit_entries`
  return rows[0]?.n ?? 0
})

layer(Testing.layer([]))("Writes", (test) => {
  test.effect("appends the audit entry in the write's transaction", () =>
    Effect.gen(function* () {
      const writes = yield* Global.Writes
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE IF NOT EXISTS probe (id TEXT PRIMARY KEY)`
      const before = yield* count
      yield* writes.run(
        "global.probe.created",
        Global.write(sql`INSERT INTO probe VALUES ('a')`).pipe(
          Effect.as({ result: "a", subject: "probe/a", before: Option.none(), after: Option.some({ id: "a" }) })
        )
      )
      assert.strictEqual(yield* count, before + 1)
    })
  )

  test.effect("rolls the write and its entry back together when the body fails", () =>
    Effect.gen(function* () {
      const writes = yield* Global.Writes
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE IF NOT EXISTS probe (id TEXT PRIMARY KEY)`
      const before = yield* count
      const failed = yield* writes
        .run(
          "global.probe.created",
          Global.write(sql`INSERT INTO probe VALUES ('b')`).pipe(
            Effect.andThen(Effect.fail(new Errors.Refused({ code: "global.probe", reason: "no" })))
          )
        )
        .pipe(Effect.flip)
      assert.strictEqual(failed._tag, "Refused")
      assert.strictEqual(yield* count, before)
      const probe = yield* sql`SELECT * FROM probe WHERE id = 'b'`
      assert.strictEqual(probe.length, 0)
    })
  )

  test.effect("refuses to change an audit entry", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const error = yield* sql`DELETE FROM global_audit_entries`.pipe(Effect.flip)
      assert.strictEqual(error.reason._tag, "ConstraintError")
    })
  )
})

describe("changed", () => {
  it("keeps the fields that differ and withholds the hidden ones", () => {
    const result = Global.changed({ title: "a", body: "x", done: false }, { title: "a", body: "y", done: true }, [
      "body"
    ])
    assert.deepStrictEqual(result, {
      before: { body: "[withheld]", done: false },
      after: { body: "[withheld]", done: true }
    })
  })
})
