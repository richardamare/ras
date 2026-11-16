import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Schedule from "effect/Schedule"
import type * as Layout from "./Layout.ts"
import * as Shell from "./Shell.ts"

export const api = "com.richardamare.ras"
export const ctl = "com.richardamare.ras.ctl"

/** Fills a release's plist template for this machine. */
export const render = (template: string, layout: Layout.Layout) =>
  template.replaceAll("__STATE__", escape(layout.state)).replaceAll("__LOGS__", escape(layout.logs))

const escape = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")

const domain = Effect.map(Shell.run("id", ["-u"]), (uid) => `gui/${uid}`)

export const isLoaded = (label: string) =>
  Effect.flatMap(domain, (gui) => Shell.succeeds("launchctl", ["print", `${gui}/${label}`]))

/** Writes the agent's plist from `release`; true when it differs from the one installed. */
export const write = (label: string, release: string, layout: Layout.Layout) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const plist = render(yield* fs.readFileString(path.join(release, "deploy", "launchd", `${label}.plist`)), layout)
    const installed = path.join(layout.launchAgents, `${label}.plist`)
    const before = yield* fs.readFileString(installed).pipe(Effect.orElseSucceed(() => ""))
    if (before === plist) return false
    yield* fs.makeDirectory(layout.logs, { recursive: true })
    yield* fs.writeFileString(installed, plist)
    return true
  }).pipe(
    Effect.mapError(
      (error) => new Shell.Failed({ reason: `The ${label} plist could not be written: ${String(error)}` })
    )
  )

/** Removes the agent and waits until launchd lets go of it; bootout returns while the service still exists. */
export const unload = (label: string) =>
  Effect.gen(function* () {
    if (!(yield* isLoaded(label))) return
    const gui = yield* domain
    yield* Shell.run("launchctl", ["bootout", `${gui}/${label}`])
    yield* isLoaded(label).pipe(
      Effect.flatMap((loaded) =>
        loaded ? Effect.fail(new Shell.Failed({ reason: `launchd still holds ${label}.` })) : Effect.void
      ),
      Effect.retry({ schedule: Schedule.spaced("250 millis"), times: 120 })
    )
  })

/** Loads the agent from its plist, replacing the definition launchd holds. */
export const load = (label: string, layout: Layout.Layout) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    yield* unload(label)
    yield* Shell.run("launchctl", ["bootstrap", yield* domain, path.join(layout.launchAgents, `${label}.plist`)])
  })

export const restart = (label: string) =>
  Effect.flatMap(domain, (gui) => Shell.run("launchctl", ["kickstart", "-k", `${gui}/${label}`]))

/** Starts the agent on `release`: reloads it when its plist changed, restarts it otherwise. */
export const start = (label: string, release: string, layout: Layout.Layout) =>
  Effect.gen(function* () {
    const changed = yield* write(label, release, layout)
    if (changed || !(yield* isLoaded(label))) yield* load(label, layout)
    else yield* restart(label)
  })

export const describe = (label: string) =>
  Effect.gen(function* () {
    if (!(yield* isLoaded(label))) return "not loaded"
    const printed = yield* Shell.run("launchctl", ["print", `${yield* domain}/${label}`])
    const lines = printed.split("\n").map((line) => line.trim())
    return ["state = ", "pid = "]
      .flatMap((field) => lines.filter((line) => line.startsWith(field)).slice(0, 1))
      .join(", ")
  })
