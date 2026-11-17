import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Module from "@ras/kernel/Module"
import * as Calendar from "./Calendar.ts"
import * as Http from "./Http.ts"
import * as Migrations from "./Migrations.ts"
import * as Reclaim from "./Reclaim.ts"
import * as Sample from "./Sample.ts"
import * as Tools from "./Tools.ts"

/** Reclaim, or with `RAS_SAMPLE` set the invented calendars. */
const source = Layer.unwrap(
  Effect.map(Config.Boolean("RAS_SAMPLE").pipe(Config.withDefault(false)), (sample) =>
    sample ? Sample.layer : Reclaim.live
  ).pipe(Effect.orDie)
)

export const module = Module.make({
  name: "calendar",
  migrations: Migrations.migrations,
  services: Calendar.Calendar.layer.pipe(Layer.provide(source)),
  http: { group: Http.group, handlers: Http.handlers },
  tools: { toolkit: Tools.toolkit, handlers: Tools.handlers }
})
