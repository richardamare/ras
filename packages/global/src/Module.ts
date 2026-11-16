import * as Module from "@ras/kernel/Module"
import * as Http from "./Http.ts"
import * as Migrations from "./Migrations.ts"
import * as Tools from "./Tools.ts"
import * as Writes from "./Writes.ts"

export const module = Module.make({
  name: "global",
  migrations: Migrations.migrations,
  services: Writes.Writes.layer,
  http: { group: Http.group, handlers: Http.handlers },
  tools: { toolkit: Tools.toolkit, handlers: Tools.handlers }
})
