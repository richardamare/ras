import * as BunSqlite from "bun:sqlite"
import * as BunServices from "@effect/platform-bun/BunServices"
import { assert, describe, it } from "@effect/vitest"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Testing from "@ras/global/testing"
import * as Backup from "../../src/backup/Backup.ts"

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

  it.effect("removes a half copy an interrupted backup left in the iCloud folder", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const icloud = yield* fs.makeTempDirectoryScoped({ prefix: "ras-icloud-" })
      yield* fs.writeFileString(path.join(icloud, ".ras-2026-11-01T0300.db.partial"), "half")
      yield* Backup.run.pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord({ RAS_BACKUP_ICLOUD: icloud })))
      )
      const files = yield* fs.readDirectory(icloud)
      assert.deepStrictEqual(
        files.map((file) => /^ras-\d{4}-\d{2}-\d{2}T\d{4}\.db$/.test(file)),
        [true]
      )
    }).pipe(Effect.scoped, Effect.provide(Testing.database([])), Effect.provide(BunServices.layer))
  )
})
