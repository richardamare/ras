import * as BunHttpServer from "@effect/platform-bun/BunHttpServer"
import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder"
import * as Global from "@ras/global"
import * as Module from "@ras/kernel/Module"
import * as Api from "./Api.ts"
import * as Backup from "./Backup.ts"
import * as Mcp from "./Mcp.ts"
import * as Modules from "./Modules.ts"

const health = HttpRouter.add("GET", "/health", HttpServerResponse.jsonUnsafe({ ok: true }))

/** Every route of ras: the HTTP API with its OpenAPI document, the connector, and the modules' own routes. */
export const routes = Layer.mergeAll(
  HttpApiBuilder.layer(Api.Api, { openapiPath: "/openapi.json" }).pipe(
    Layer.provide(Api.HttpHandlers),
    Layer.provide(Global.session)
  ),
  Mcp.routes,
  Module.routes(Modules.modules),
  health
)

export const database = (filename: string) =>
  Layer.effectDiscard(Effect.orDie(Api.migrate)).pipe(Layer.provideMerge(SqliteClient.layer({ filename })))

export const serve = (options: { readonly port: number; readonly database: string }) =>
  Layer.merge(HttpRouter.serve(routes).pipe(Layer.provide(Api.Services)), Backup.nightly).pipe(
    Layer.provide(database(options.database)),
    Layer.provide(BunHttpServer.layer({ port: options.port }))
  )
