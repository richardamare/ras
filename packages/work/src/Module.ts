import * as Layer from "effect/Layer"
import * as Module from "@ras/kernel/Module"
import * as Blocks from "./Blocks.ts"
import * as Board from "./Board.ts"
import * as Http from "./Http.ts"
import * as Migrations from "./Migrations.ts"
import * as Tools from "./Tools.ts"

export const module = Module.make({
  name: "work",
  migrations: Migrations.migrations,
  services: Layer.mergeAll(Board.Board.layer, Blocks.Blocks.layer),
  ports: Blocks.Blocks.busyTime,
  http: { group: Http.group, handlers: Http.handlers },
  tools: { toolkit: Tools.toolkit, handlers: Tools.handlers }
})
