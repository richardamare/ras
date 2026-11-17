import * as Layer from "effect/Layer"
import * as McpProtocol from "effect/ai/McpProtocol"
import * as McpServer from "effect/ai/McpServer"
import * as Global from "@ras/global"
import * as Package from "../../../../package.json" with { type: "json" }
import * as Api from "../composition/Api.ts"

/** Every module's tools over streamable HTTP at `/mcp`, for the MCP clients the owner connected. */
export const routes = McpServer.layerHttp({
  name: "ras",
  version: Package.version,
  description: "The owner's calendar, board, memory and mail.",
  instructions: "Every tool runs as the owner, through the client that connected.",
  path: "/mcp",
  protocols: [McpProtocol.v2026_07_28, McpProtocol.v2025_11_25, McpProtocol.v2025_06_18, McpProtocol.v2025_03_26],
  registrations: McpServer.toolkit(Api.Toolkit).pipe(Layer.provide(Api.ToolHandlers))
}).pipe(Layer.provide(Global.connector.layer), Layer.orDie)
