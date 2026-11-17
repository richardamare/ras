import * as OpenApi from "effect/http-api/OpenApi"
import * as Global from "@ras/global"
import * as Module from "@ras/kernel/Module"
import * as Package from "../../../../package.json" with { type: "json" }
import * as Modules from "./Modules.ts"

export const Api = Module.api(Modules.modules)
  .middleware(Global.Authenticated)
  .annotateMerge(OpenApi.annotations({ title: "ras", version: Package.version }))

export const openApi = () => OpenApi.fromApi(Api)

export const Toolkit = Module.toolkit(Modules.modules)
export const Services = Module.services(Modules.modules)
export const HttpHandlers = Module.httpHandlers(Modules.modules)
export const ToolHandlers = Module.toolHandlers(Modules.modules)
export const migrate = Module.migrate(Modules.modules)
