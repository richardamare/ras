import * as BunRuntime from "@effect/platform-bun/BunRuntime"
import * as BunServices from "@effect/platform-bun/BunServices"
import * as Config from "effect/Config"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Prompt from "effect/cli/Prompt"
import * as Global from "@ras/global"
import * as Package from "../../../package.json" with { type: "json" }
import * as Api from "./Api.ts"
import * as Server from "./Server.ts"

const database = Flag.String("database").pipe(
  Flag.withDescription("The SQLite file, created when missing."),
  Flag.withFallbackConfig(Config.String("RAS_DATABASE"))
)

const port = Flag.Int("port").pipe(
  Flag.withDescription("The port the API listens on."),
  Flag.withFallbackConfig(Config.Port("RAS_PORT"))
)

const serve = Command.make("serve", { database, port }, (flags) => Layer.launch(Server.serve(flags))).pipe(
  Command.withDescription("Migrates the database and serves the HTTP API, the connector and sign-in.")
)

const migrate = Command.make("migrate", { database }, (flags) =>
  Effect.provide(Effect.void, Server.database(flags.database))
).pipe(Command.withDescription("Brings the database up to the latest migration of every module."))

const owner = Command.make(
  "owner",
  {
    database,
    email: Flag.String("email").pipe(Flag.withDescription("The email the owner signs in with.")),
    password: Flag.Redacted("password").pipe(Flag.withFallbackPrompt(Prompt.Password({ message: "Password" })))
  },
  (flags) =>
    Global.setOwner(flags.email, flags.password).pipe(
      Effect.flatMap((outcome) => Console.log(`The owner ${flags.email} was ${outcome}.`)),
      Effect.provide(Global.Auth.layer.pipe(Layer.provide(Server.database(flags.database))))
    )
).pipe(Command.withDescription("Creates the owner's account, or sets the owner's password."))

const openapi = Command.make("openapi", {}, () => Console.log(JSON.stringify(Api.openApi(), null, 2))).pipe(
  Command.withDescription("Prints the OpenAPI document of the HTTP API. Needs no configuration and no database.")
)

const ras = Command.make("ras").pipe(Command.withSubcommands([serve, migrate, owner, openapi]))

Command.run(ras, { version: Package.version }).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain)
