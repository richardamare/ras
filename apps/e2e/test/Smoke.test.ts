import { assert, describe, layer } from "@effect/vitest"
import * as BunServices from "@effect/platform-bun/BunServices"
import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient"
import * as Config from "effect/Config"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as SqlClient from "effect/sql/SqlClient"
import * as Ras from "../src/Ras.ts"
import * as Smoke from "../src/Smoke.ts"

const port = Effect.map(Config.Port("RAS_E2E_PORT").pipe(Config.withDefault(4240)), (shared) => shared + 1)

/** A ras of the test's own that it restarts, and the smoke run's target on it. */
const restartable = Effect.gen(function* () {
  const ras = yield* Ras.restartable(yield* port)
  const target: Smoke.Target = {
    url: ras.url,
    owner: { email: Ras.owner.email, password: Redacted.make(Ras.owner.password) }
  }
  return { ras, target }
})

/** A copy of the live database at `into`, standing in for a restore of the replica. */
const copyOf = (database: string) => (into: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`VACUUM INTO ${into}`
  }).pipe(Effect.provide(SqliteClient.layer({ filename: database, readonly: true })), Effect.orDie)

const quick = { attempts: 2, settle: Duration.seconds(20), margin: Duration.seconds(1), pace: Duration.millis(100) }

describe("the smoke run", () => {
  layer(Layer.mergeAll(BunServices.layer, FetchHttpClient.layer), { excludeTestServices: true })(
    "against a ras that stops and starts again",
    (it) => {
      it.effect(
        "reads a write back after the instance stops while idle, and the connector calls a tool on the same token",
        () =>
          Effect.gen(function* () {
            const { ras, target } = yield* restartable
            const report = yield* Smoke.idle(target, { ...quick, stop: ras.restart })
            assert.notStrictEqual(report.after, report.before)
            assert.deepStrictEqual(report.connector, ["reinitialized"])
          }),
        60_000
      )

      it.effect(
        "fails when the new instance lost the write",
        () =>
          Effect.gen(function* () {
            const { ras, target } = yield* restartable
            const failure = yield* Effect.flip(Smoke.idle(target, { ...quick, stop: ras.replace }))
            assert.include(failure.message, "lost")
          }),
        60_000
      )

      it.effect(
        "fails when the instance never stops",
        () =>
          Effect.gen(function* () {
            const { target } = yield* restartable
            const failure = yield* Effect.flip(Smoke.idle(target, { ...quick, stop: Effect.void }))
            assert.include(failure.message, "same instance")
          }),
        60_000
      )

      it.effect(
        "loses no write across a deploy, and the restored replica holds every one",
        () =>
          Effect.gen(function* () {
            const { ras, target } = yield* restartable
            const report = yield* Smoke.deploy(target, { ...quick, deploy: ras.restart, restore: copyOf(ras.database) })
            assert.isAbove(report.acknowledged, 0)
            assert.strictEqual(report.restored, report.acknowledged)
          }),
        60_000
      )

      it.effect(
        "fails when the deploy lost writes",
        () =>
          Effect.gen(function* () {
            const { ras, target } = yield* restartable
            const failure = yield* Effect.flip(
              Smoke.deploy(target, { ...quick, deploy: ras.replace, restore: copyOf(ras.database) })
            )
            assert.include(failure.message, "lost")
          }),
        60_000
      )
    }
  )
})
