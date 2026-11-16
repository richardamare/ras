import * as BunRuntime from "@effect/platform-bun/BunRuntime"
import * as BunServices from "@effect/platform-bun/BunServices"
import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Package from "../../../package.json" with { type: "json" }
import * as Api from "./Api.ts"

const database = Flag.String("database").pipe(Flag.withDescription("The SQLite file, created when missing."))

const migrate = Command.make("migrate", { database }, (flags) =>
  Api.migrate.pipe(Effect.provide(SqliteClient.layer({ filename: flags.database })))
).pipe(Command.withDescription("Brings the database up to the latest migration of every module."))

const openapi = Command.make("openapi", {}, () => Console.log(JSON.stringify(Api.openApi(), null, 2))).pipe(
  Command.withDescription("Prints the OpenAPI document of the HTTP API. Needs no configuration and no database.")
)

const ras = Command.make("ras").pipe(Command.withSubcommands([migrate, openapi]))

Command.run(ras, { version: Package.version }).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain)
