import * as Layer from "effect/Layer"
import * as Module from "@ras/kernel/Module"
import * as Clone from "./Clone.ts"
import * as Memory from "./Memory.ts"
import * as Migrations from "./Migrations.ts"
import * as SearchIndexRepository from "./SearchIndexRepository.ts"
import * as Tools from "./Tools.ts"
import * as Webhook from "./Webhook.ts"

export const module = Module.make({
  name: "memory",
  migrations: Migrations.migrations,
  services: Memory.Memory.layer.pipe(
    Layer.provide(Layer.merge(Clone.Clone.layer, SearchIndexRepository.SearchIndexRepository.layer))
  ),
  tools: { toolkit: Tools.toolkit, handlers: Tools.handlers },
  routes: Webhook.routes
})
