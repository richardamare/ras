import * as BunRuntime from "@effect/platform-bun/BunRuntime"
import * as BunServices from "@effect/platform-bun/BunServices"
import * as Config from "effect/Config"
import * as Console from "effect/Console"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Prompt from "effect/cli/Prompt"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Smoke from "./Smoke.ts"

const url = Flag.String("url").pipe(
  Flag.withDescription("The service's own address, such as https://ras-123456789.europe-west1.run.app."),
  Flag.withFallbackConfig(Config.String("RAS_SMOKE_URL"))
)
const email = Flag.String("email").pipe(
  Flag.withDescription("The email the owner signs in with."),
  Flag.withFallbackConfig(Config.String("RAS_SMOKE_EMAIL"))
)
const password = Flag.Redacted("password").pipe(
  Flag.withDescription("The owner's password; asked for when neither the flag nor RAS_SMOKE_PASSWORD gives it."),
  Flag.withFallbackConfig(Config.Redacted("RAS_SMOKE_PASSWORD")),
  Flag.withFallbackPrompt(Prompt.Password({ message: "The owner's password" }))
)
const target = { url, email, password }

const toTarget = (flags: {
  readonly url: string
  readonly email: string
  readonly password: Smoke.Target["owner"]["password"]
}) => ({
  url: new URL(flags.url),
  owner: { email: flags.email, password: flags.password }
})

/** Runs a command with its output on the terminal, failing unless it exits 0. */
const exec = (command: string, args: ReadonlyArray<string>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const handle = yield* spawner.spawn(
        ChildProcess.make(command, args, { stdin: "inherit", stdout: "inherit", stderr: "inherit" })
      )
      const code = yield* handle.exitCode
      if (Number(code) !== 0)
        return yield* Effect.fail(new Smoke.SmokeFailed({ message: `${command} ${args.join(" ")} exited ${code}.` }))
    })
  ).pipe(Smoke.failing(command))

const idle = Command.make(
  "idle",
  {
    ...target,
    minutes: Flag.Int("idle-minutes").pipe(
      Flag.withDescription("How long to send nothing before asking whether another instance answers."),
      Flag.withDefault(20)
    ),
    attempts: Flag.Int("attempts").pipe(
      Flag.withDescription("How many idle waits to try before failing."),
      Flag.withDefault(3)
    )
  },
  (flags) => {
    const wait = Duration.minutes(flags.minutes)
    const stop = Effect.andThen(
      Console.log(`Sending nothing for ${Duration.format(wait)}, so the instance stops while idle.`),
      Effect.sleep(wait)
    )
    return Smoke.idle(toTarget(flags), { stop, attempts: flags.attempts }).pipe(
      Effect.flatMap((report) =>
        Console.log(
          `Passed. Instance ${report.after} read back the write instance ${report.before} acknowledged, and the connector called a tool on its token${report.connector.length === 0 ? "" : ` after it ${report.connector.join(" and ")}`}.`
        )
      )
    )
  }
).pipe(
  Command.withDescription(
    "Writes, waits until the instance stops while idle, then reads the write back and calls a tool without reconnecting."
  )
)

const deploy = Command.make(
  "deploy",
  {
    ...target,
    command: Flag.String("deploy").pipe(
      Flag.withDescription("The shell command that deploys a new revision, run while the writes go on."),
      Flag.withFallbackConfig(Config.String("RAS_SMOKE_DEPLOY"))
    ),
    replica: Flag.String("replica").pipe(
      Flag.withDescription("The replica's URL, such as gs://<project>-replica/ras, which `litestream restore` reads."),
      Flag.withFallbackConfig(Config.String("RAS_SMOKE_REPLICA"))
    ),
    settle: Flag.Int("settle-minutes").pipe(
      Flag.withDescription("How long after the deploy command another instance may take to answer."),
      Flag.withDefault(10)
    )
  },
  (flags) =>
    Smoke.deploy(toTarget(flags), {
      deploy: exec("sh", ["-c", flags.command]),
      restore: (into) => exec("litestream", ["restore", "-o", into, flags.replica]),
      settle: Duration.minutes(flags.settle),
      margin: Duration.seconds(15),
      pace: Duration.seconds(1)
    }).pipe(
      Effect.flatMap((report) =>
        Console.log(
          `Passed. ${report.acknowledged} writes went through and read back, ${report.refused} were refused while instance ${report.before} gave way to ${report.after}, and the restored replica holds all ${report.restored}.`
        )
      )
    )
).pipe(
  Command.withDescription(
    "Writes while a deploy runs, then reads every acknowledged write back and restores the replica into an empty directory."
  )
)

const smoke = Command.make("smoke").pipe(
  Command.withDescription("Checks a ras on Cloud Run at its own address."),
  Command.withSubcommands([idle, deploy])
)

Command.run(smoke, { version: "1" }).pipe(
  Effect.tapErrorTag("SmokeFailed", (error) => Console.error(`Failed. ${error.message}`)),
  Effect.provide(Layer.merge(BunServices.layer, FetchHttpClient.layer)),
  BunRuntime.runMain
)
