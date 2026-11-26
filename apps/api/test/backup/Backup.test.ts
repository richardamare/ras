import * as BunSqlite from "bun:sqlite"
import * as BunServices from "@effect/platform-bun/BunServices"
import { assert, describe, it } from "@effect/vitest"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
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

  it.effect("copies a readable snapshot of the database into the iCloud folder", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const icloud = yield* fs.makeTempDirectoryScoped({ prefix: "ras-icloud-" })
      yield* Backup.run.pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord({ RAS_BACKUP_ICLOUD: icloud })))
      )
      const files = yield* fs.readDirectory(icloud)
      assert.strictEqual(files.length, 1)
      const copy = new BunSqlite.Database(path.join(icloud, files[0]!), { readonly: true })
      const tables = copy.query("SELECT name FROM sqlite_master WHERE name = 'global_audit_entries'").all()
      copy.close()
      assert.strictEqual(tables.length, 1)
    }).pipe(Effect.scoped, Effect.provide(Testing.database([])), Effect.provide(BunServices.layer))
  )

  it.effect("uploads a readable snapshot of the database to R2 and keeps the newest 30 there", () =>
    Effect.gen(function* () {
      const s3 = yield* ApiTesting.localS3(0)
      const older = Array.from({ length: 30 }, (_, day) => `ras-1969-12-${String(day + 1).padStart(2, "0")}T0300.db`)
      for (const name of older) s3.objects.set(name, new Uint8Array())
      yield* Backup.run.pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord(s3.settings))))
      const kept = [...s3.objects.keys()].toSorted()
      assert.strictEqual(kept.length, 30)
      assert.deepStrictEqual(kept.slice(0, 29), older.slice(1))
      assert.isTrue(readable(s3.objects.get(kept[29]!)!))
    }).pipe(Effect.scoped, Effect.provide(Testing.database([])), Effect.provide(BunServices.layer))
  )
})
