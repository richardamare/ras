import * as Layer from "effect/Layer"
import * as Module from "@ras/kernel/Module"
import * as Agents from "./Agents.ts"
import * as Auth from "./Auth.ts"
import * as Graph from "./Graph.ts"
import * as Http from "./Http.ts"
import * as Migrations from "./Migrations.ts"
import * as Routes from "./Routes.ts"
import * as Tools from "./Tools.ts"
import * as Writes from "./Writes.ts"

export const module = Module.make({
  name: "global",
  migrations: Migrations.migrations,
  services: Layer.mergeAll(Agents.Agents.layer, Graph.layer).pipe(
    Layer.provideMerge(Writes.Writes.layer),
    Layer.merge(Auth.Auth.layer)
  ),
  http: { group: Http.group, handlers: Http.handlers },
  tools: { toolkit: Tools.toolkit, handlers: Tools.handlers },
  routes: Layer.merge(Routes.routes, Graph.routes)
})
