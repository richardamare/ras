import * as Layer from "effect/Layer"
import * as Module from "@ras/kernel/Module"
import * as Agents from "./agents/Agents.ts"
import * as Auth from "./auth/Auth.ts"
import * as Clients from "./auth/Clients.ts"
import * as Graph from "./graph/Graph.ts"
import * as Http from "./Http.ts"
import * as Migrations from "./Migrations.ts"
import * as Routes from "./auth/Routes.ts"
import * as Tools from "./Tools.ts"
import * as Writes from "./audit/Writes.ts"

export const module = Module.make({
  name: "global",
  migrations: Migrations.migrations,
  services: Layer.mergeAll(Agents.Agents.layer, Clients.Clients.layer, Graph.layer).pipe(
    Layer.provideMerge(Writes.Writes.layer),
    Layer.merge(Auth.Auth.layer)
  ),
  http: { group: Http.group, handlers: Http.handlers },
  tools: { toolkit: Tools.toolkit, handlers: Tools.handlers },
  routes: Layer.merge(Routes.routes, Graph.routes)
})
