import * as BunRuntime from "@effect/platform-bun/BunRuntime"
import * as BunServices from "@effect/platform-bun/BunServices"
import * as Config from "effect/Config"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Argument from "effect/cli/Argument"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Prompt from "effect/cli/Prompt"
import * as Global from "@ras/global"
import * as Package from "../../../package.json" with { type: "json" }
import * as Api from "./Api.ts"
import * as Backup from "./Backup.ts"
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

/** The owner at the host's command line, as the audit records it. */
const atCli = (file: string) =>
  Layer.mergeAll(
    Global.Agents.layer.pipe(Layer.provideMerge(Global.Writes.layer)),
    Layer.succeed(Global.CurrentActor, new Global.Actor({ channel: { _tag: "Cli" }, agent: Option.none() }))
  ).pipe(Layer.provide(Server.database(file)))

const slug = Argument.String("slug").pipe(
  Argument.withSchema(Global.AgentSlug),
  Argument.withDescription("The agent's slug, such as `scheduler`.")
)

const show = (agent: Global.Agent) => Console.log(`${agent.slug}\t${agent.name}${agent.archived ? "\t(archived)" : ""}`)

const agent = Command.make("agent").pipe(
  Command.withDescription("Lists, adds and archives the agents the owner's bots act as."),
  Command.withSubcommands([
    Command.make("list", { database }, (flags) =>
      Effect.flatMap(
        Global.Agents.use((agents) => agents.list),
        Effect.forEach(show)
      ).pipe(Effect.provide(atCli(flags.database)))
    ).pipe(Command.withDescription("Lists every agent, archived ones too.")),
    Command.make(
      "add",
      { database, slug, name: Flag.String("name").pipe(Flag.withDescription("The name the console shows.")) },
      (flags) =>
        Global.Agents.use((agents) => agents.add(flags.slug, flags.name)).pipe(
          Effect.flatMap(show),
          Effect.provide(atCli(flags.database))
        )
    ).pipe(Command.withDescription("Adds an agent.")),
    Command.make("archive", { database, slug }, (flags) =>
      Global.Agents.use((agents) => agents.archive(flags.slug)).pipe(
        Effect.flatMap(show),
        Effect.provide(atCli(flags.database))
      )
    ).pipe(Command.withDescription("Archives an agent, so no tool acts as it again."))
  ])
)

const backup = Command.make("backup", { database }, (flags) =>
  Effect.provide(Backup.run, Server.database(flags.database))
).pipe(
  Command.withDescription("Backs the database up now, to the iCloud folder and the R2 bucket that are configured.")
)

const openapi = Command.make("openapi", {}, () => Console.log(JSON.stringify(Api.openApi(), null, 2))).pipe(
  Command.withDescription("Prints the OpenAPI document of the HTTP API. Needs no configuration and no database.")
)

const ras = Command.make("ras").pipe(Command.withSubcommands([serve, migrate, owner, agent, backup, openapi]))

Command.run(ras, { version: Package.version }).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain)
