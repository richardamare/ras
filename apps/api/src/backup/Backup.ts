import * as Arr from "effect/Array"
import * as Config from "effect/Config"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import * as Redacted from "effect/Redacted"
import * as SqlClient from "effect/sql/SqlClient"
import * as Time from "@ras/kernel/Time"

const kept = 30

const settings = Config.option(
  Config.all({
    endpoint: Config.String("RAS_BACKUP_R2_ENDPOINT"),
    bucket: Config.String("RAS_BACKUP_R2_BUCKET"),
    accessKeyId: Config.String("RAS_BACKUP_R2_ACCESS_KEY_ID"),
    secretAccessKey: Config.Redacted("RAS_BACKUP_R2_SECRET_ACCESS_KEY")
  })
)

/** `ras-2026-11-17T0300.db`: sorting the names sorts the backups by time. */
const name = (at: DateTime.Utc) => `ras-${Time.toPragueLocal(at).replace(":", "")}.db`

const isBackup = (file: string) => /^ras-\d{4}-\d{2}-\d{2}T\d{4}\.db$/.test(file)

/** The names past the newest `keep`. */
export const expired = (names: ReadonlyArray<string>, keep: number) =>
  Arr.sort(Arr.filter(names, isBackup), Order.flip(Order.String)).slice(keep)

/**
 * Copies the database with `VACUUM INTO`, which reads one consistent snapshot while the API keeps writing, into the R2
 * bucket, and prunes the bucket to its newest backups.
 */
export const run = Effect.gen(function* () {
  const r2 = yield* settings
  if (Option.isNone(r2)) return yield* Effect.logWarning("No R2 bucket is configured for the backup.")
  const sql = yield* SqlClient.SqlClient
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const file = name(yield* DateTime.now)
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "ras-backup-" })
  const snapshot = path.join(directory, file)
  yield* sql.unsafe("VACUUM INTO ?", [snapshot])

  const bucket = new Bun.S3Client({
    endpoint: r2.value.endpoint,
    bucket: r2.value.bucket,
    accessKeyId: r2.value.accessKeyId,
    secretAccessKey: Redacted.value(r2.value.secretAccessKey)
  })
  yield* Effect.tryPromise(async () => {
    await bucket.write(file, Bun.file(snapshot))
    const listed = await bucket.list({ prefix: "ras-" })
    const names = Arr.map(listed.contents ?? [], (object) => object.key)
    await Promise.all(expired(names, kept).map((old) => bucket.delete(old)))
  })
  yield* Effect.log(`Backed up the database as ${file}.`)
}).pipe(Effect.scoped, Effect.withSpan("backup"))
