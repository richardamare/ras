import * as BunRuntime from "@effect/platform-bun/BunRuntime"
import * as BunServices from "@effect/platform-bun/BunServices"
import * as Config from "effect/Config"
import type * as Context from "effect/Context"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Argument from "effect/cli/Argument"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Prompt from "effect/cli/Prompt"
import type * as SqlClient from "effect/sql/SqlClient"
import * as Global from "@ras/global"
import * as Package from "../../../package.json" with { type: "json" }
import * as Api from "./composition/Api.ts"
import * as Backup from "./backup/Backup.ts"
import * as Server from "./server/Server.ts"

const database = Flag.String("database").pipe(
  Flag.withDescription("The SQLite file, created when missing."),
  Flag.withFallbackConfig(Config.String("RAS_DATABASE"))
)

const port = Flag.Int("port").pipe(
  Flag.withDescription("The port the API listens on."),
  Flag.withFallbackConfig(Config.Port("RAS_PORT"))
)

const serve = Command.make("serve", { database, port }, (flags) => Layer.launch(Server.serve(flags))).pipe(
  Command.withDescription("Migrates the database and serves the HTTP API, the connector, sign-in and the console.")
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

/** `ras <name> connect` and `ras <name> status` for an account ras holds its own tokens to. */
const accountCommand = <I>(
  name: string,
  label: string,
  signIn: string,
  connection: Context.Key<I, Global.OAuthService>,
  layer: Layer.Layer<I, never, Global.Writes | SqlClient.SqlClient>
) => {
  const at = (file: string) => layer.pipe(Layer.provide(Global.Writes.layer), Layer.provide(Server.database(file)))
  return Command.make(name).pipe(
    Command.withDescription(`Connects the owner's ${label} account, whose calendars ras writes.`),
    Command.withSubcommands([
      Command.make("connect", { database }, (flags) =>
        Effect.flatMap(Effect.service(connection), (account) => account.connect).pipe(
          Effect.flatMap((url) => Console.log(`Open this within ten minutes and allow ras the calendar:\n${url.href}`)),
          Effect.provide(at(flags.database))
        )
      ).pipe(
        Command.withDescription(
          `Prints the ${signIn} sign-in that connects ${label}; ras's callback stores the tokens.`
        )
      ),
      Command.make("status", { database }, (flags) =>
        Effect.flatMap(Effect.service(connection), (account) => account.connection).pipe(
          Effect.flatMap((found) =>
            Console.log(
              Option.match(found, {
                onNone: () => `${label} is not connected.`,
                onSome: (connected) => `${label} ${connected.account} is connected since ${connected.connected}.`
              })
            )
          ),
          Effect.provide(at(flags.database))
        )
      ).pipe(Command.withDescription(`Says which ${label} account is connected.`))
    ])
  )
}

const graph = accountCommand("graph", "Outlook", "Microsoft", Global.Graph, Global.graph)
const google = accountCommand("google", "Google", "Google", Global.Google, Global.google)

const backup = Command.make("backup", { database }, (flags) =>
  Effect.provide(Backup.run, Server.database(flags.database))
).pipe(
  Command.withDescription("Backs the database up now, to the iCloud folder and the R2 bucket that are configured.")
)

const openapi = Command.make("openapi", {}, () => Console.log(JSON.stringify(Api.openApi(), null, 2))).pipe(
  Command.withDescription("Prints the OpenAPI document of the HTTP API. Needs no configuration and no database.")
)

const ras = Command.make("ras").pipe(
  Command.withSubcommands([serve, migrate, owner, agent, graph, google, backup, openapi])
)

Command.run(ras, { version: Package.version }).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain)
