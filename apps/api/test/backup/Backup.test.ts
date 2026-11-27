import * as BunSqlite from "bun:sqlite"
import * as BunServices from "@effect/platform-bun/BunServices"
import { assert, describe, it } from "@effect/vitest"
import * as Arr from "effect/Array"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Order from "effect/Order"
import * as Testing from "@ras/global/testing"
import * as Backup from "../../src/backup/Backup.ts"
import * as ApiTesting from "../../src/Testing.ts"

const readable = (bytes: Uint8Array) => {
  const copy = BunSqlite.Database.deserialize(bytes)
  const tables = copy.query("SELECT name FROM sqlite_master WHERE name = 'global_audit_entries'").all()
  copy.close()
  return tables.length === 1
}

describe("the backup", () => {
  it("keeps the newest backups by name", () => {
    const names = ["ras-2026-11-01T0300.db", "ras-2026-11-03T0300.db", "ras-2026-11-02T0300.db", "notes.txt"]
    assert.deepStrictEqual(Backup.expired(names, 2), ["ras-2026-11-01T0300.db"])
  })

  it.effect("uploads a readable snapshot of the database to R2 and keeps the newest 30 there", () =>
    Effect.gen(function* () {
      const s3 = yield* ApiTesting.localS3
      const older = Arr.makeBy(30, (day) => `ras-1969-12-${String(day + 1).padStart(2, "0")}T0300.db`)
      Arr.forEach(older, (name) => s3.objects.set(name, new Uint8Array()))
      yield* Backup.run.pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord(ApiTesting.settings(s3.bucket))))
      )
      const kept = Arr.sort(Arr.fromIterable(s3.objects.keys()), Order.String)
      assert.strictEqual(kept.length, 30)
      assert.deepStrictEqual(kept.slice(0, 29), older.slice(1))
      assert.isTrue(readable(s3.objects.get(kept[29]!)!))
    }).pipe(Effect.scoped, Effect.provide(Testing.database([])), Effect.provide(BunServices.layer))
  )
})
