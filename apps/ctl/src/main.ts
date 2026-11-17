import * as BunRuntime from "@effect/platform-bun/BunRuntime"
import * as BunServices from "@effect/platform-bun/BunServices"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schedule from "effect/Schedule"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as Deployer from "./deploy/Deployer.ts"
import * as GitHub from "./releases/GitHub.ts"
import * as Launchd from "./deploy/Launchd.ts"
import * as Layout from "./deploy/Layout.ts"
import * as Releases from "./releases/Releases.ts"
import * as Shell from "./shell/Shell.ts"

/** How often `serve` asks GitHub for a newer release; the public API allows 60 unauthenticated calls an hour. */
const checkEvery = "2 minutes"

const deployer = Effect.flatMap(Layout.make, Deployer.make)

const failOn = (outcome: Deployer.Outcome) =>
  outcome === "RolledBack"
    ? Effect.fail(new Shell.Failed({ reason: "The release did not turn healthy and was rolled back." }))
    : Effect.void

/** The controller runs from the current release, so after a deploy it reloads onto the new one. */
const reloadCtl = Effect.gen(function* () {
  const layout = yield* Layout.make
  const current = yield* Releases.target(layout.current)
  if (Option.isNone(current)) return
  if ((yield* Launchd.write(Launchd.ctl, current.value, layout)) || !(yield* Launchd.isLoaded(Launchd.ctl))) {
    yield* Launchd.load(Launchd.ctl, layout)
  } else {
    yield* Launchd.restart(Launchd.ctl)
  }
})

const install = Command.make("install", {}, () =>
  Effect.gen(function* () {
    const ctl = yield* deployer
    yield* failOn(yield* ctl.deploy(Option.none(), false))
    yield* reloadCtl
    yield* Console.log(`Installed ${Launchd.api} and ${Launchd.ctl}.`)
  })
).pipe(Command.withDescription("Deploys the latest release and installs the API and controller agents."))

const deploy = Command.make(
  "deploy",
  { tag: Flag.String("tag").pipe(Flag.optional, Flag.withDescription("A release tag instead of the latest release.")) },
  ({ tag }) =>
    Effect.gen(function* () {
      const ctl = yield* deployer
      const outcome = yield* ctl.deploy(tag, false)
      yield* Console.log(outcome)
      yield* failOn(outcome)
      if (outcome === "Deployed" && (yield* Launchd.isLoaded(Launchd.ctl))) yield* reloadCtl
    })
).pipe(
  Command.withDescription("Deploys the latest release, or --tag; a release that fails its health check is rolled back.")
)

const rollback = Command.make("rollback", {}, () => Effect.flatMap(deployer, (it) => it.rollback)).pipe(
  Command.withDescription("Goes back to the previous release.")
)

const show = (tag: Option.Option<string>) => Option.getOrElse(tag, () => "(none)")

const status = Command.make("status", {}, () =>
  Effect.gen(function* () {
    const layout = yield* Layout.make
    const health = yield* HttpClient.get(Deployer.health).pipe(
      Effect.timeout("5 seconds"),
      Effect.map((response) => String(response.status)),
      Effect.orElseSucceed(() => "no answer")
    )
    yield* Console.log(`current   ${show(yield* Releases.tagAt(layout.current))}`)
    yield* Console.log(`previous  ${show(yield* Releases.tagAt(layout.previous))}`)
    yield* Console.log(`latest    ${yield* GitHub.latest.pipe(Effect.orElseSucceed(() => "(GitHub did not answer)"))}`)
    yield* Console.log(`api       ${yield* Launchd.describe(Launchd.api)}; health ${health}`)
    yield* Console.log(`ctl       ${yield* Launchd.describe(Launchd.ctl)}`)
  })
).pipe(Command.withDescription("Shows the deployed release, the latest one, both agents and the API's health."))

/** Checks for a newer release at start and then on a schedule; after a deploy it exits, and launchd starts the new controller. */
const serve = Command.make("serve", {}, () =>
  Effect.gen(function* () {
    const ctl = yield* deployer
    const check = ctl
      .deploy(Option.none(), true)
      .pipe(Effect.catchTag("Failed", (error) => Effect.as(Effect.logError(error.reason), "Skipped" as const)))
    yield* check.pipe(
      Effect.repeat({ schedule: Schedule.spaced(checkEvery), until: (outcome) => outcome === "Deployed" })
    )
    yield* reloadCtl
  })
).pipe(Command.withDescription(`Deploys each newer release; checks GitHub every ${checkEvery}.`))

const rasctl = Command.make("rasctl").pipe(
  Command.withDescription("Deploys and runs ras on the always-on Mac."),
  Command.withSubcommands([install, deploy, rollback, status, serve])
)

Command.run(rasctl, { version: "0.0.0" }).pipe(
  Effect.provide(Layer.mergeAll(Shell.Shell.layer, FetchHttpClient.layer).pipe(Layer.provideMerge(BunServices.layer))),
  BunRuntime.runMain
)
