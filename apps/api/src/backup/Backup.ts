import * as Arr from "effect/Array"
import * as Config from "effect/Config"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import * as Redacted from "effect/Redacted"
import * as Schedule from "effect/Schedule"
import * as SqlClient from "effect/sql/SqlClient"
import * as Time from "@ras/kernel/Time"

const keptInICloud = 7
const keptInR2 = 30

const settings = Config.all({
  icloud: Config.option(Config.String("RAS_BACKUP_ICLOUD")),
  r2: Config.option(
    Config.all({
      endpoint: Config.String("RAS_BACKUP_R2_ENDPOINT"),
      bucket: Config.String("RAS_BACKUP_R2_BUCKET"),
      accessKeyId: Config.String("RAS_BACKUP_R2_ACCESS_KEY_ID"),
      secretAccessKey: Config.Redacted("RAS_BACKUP_R2_SECRET_ACCESS_KEY")
    })
  )
})

/** `ras-2026-11-17T0300.db`: sorting the names sorts the backups by time. */
const name = (at: DateTime.Utc) => `ras-${Time.toPragueLocal(at).replace(":", "")}.db`

const isBackup = (file: string) => /^ras-\d{4}-\d{2}-\d{2}T\d{4}\.db$/.test(file)

/** The names past the newest `keep`. */
export const expired = (names: ReadonlyArray<string>, keep: number) =>
  Arr.sort(Arr.filter(names, isBackup), Order.flip(Order.String)).slice(keep)

/**
 * Copies the database with `VACUUM INTO`, which reads one consistent snapshot while the API keeps writing, into the
 * iCloud folder and the R2 bucket that are configured, and prunes each to its newest backups.
 */
export const run = Effect.gen(function* () {
  const { icloud, r2 } = yield* settings
  if (Option.isNone(icloud) && Option.isNone(r2)) return yield* Effect.logWarning("No backup target is configured.")
  const sql = yield* SqlClient.SqlClient
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const file = name(yield* DateTime.now)
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "ras-backup-" })
  const snapshot = path.join(directory, file)
  yield* sql.unsafe("VACUUM INTO ?", [snapshot])

  if (Option.isSome(icloud)) {
    yield* fs.makeDirectory(icloud.value, { recursive: true })
    yield* fs.copyFile(snapshot, path.join(icloud.value, file))
    yield* Effect.forEach(expired(yield* fs.readDirectory(icloud.value), keptInICloud), (old) =>
      fs.remove(path.join(icloud.value, old))
    )
  }

  if (Option.isSome(r2)) {
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
      await Promise.all(expired(names, keptInR2).map((old) => bucket.delete(old)))
    })
  }
  yield* Effect.log(`Backed up the database as ${file}.`)
}).pipe(Effect.scoped, Effect.withSpan("backup"))

/** Backs the database up every night at three, Prague time; a failed night is logged and the next one runs. */
export const nightly = Layer.effectDiscard(
  Effect.forkScoped(
    run.pipe(
      Effect.catchCause((cause) => Effect.logError("The backup failed.", cause)),
      Effect.schedule(Schedule.cron("0 3 * * *", "Europe/Prague"))
    )
  )
)
