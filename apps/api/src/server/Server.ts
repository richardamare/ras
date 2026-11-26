import * as BunHttpServer from "@effect/platform-bun/BunHttpServer"
import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as HttpStaticServer from "effect/http/HttpStaticServer"
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder"
import * as Global from "@ras/global"
import * as Module from "@ras/kernel/Module"
import * as Api from "../composition/Api.ts"
import * as Backup from "../backup/Backup.ts"
import * as BackupRoute from "../backup/Route.ts"
import * as GoogleIdTokens from "../backup/GoogleIdTokens.ts"
import * as Mcp from "./Mcp.ts"
import * as Modules from "../composition/Modules.ts"

/** `instance` is fresh in every process, so a caller sees when another instance answers, as after a cold start. */
const health = Layer.unwrap(
  Effect.sync(() =>
    HttpRouter.add("GET", "/health", HttpServerResponse.jsonUnsafe({ ok: true, instance: crypto.randomUUID() }))
  )
)

/**
 * The console's build from `apps/web/dist`. Its routes match only paths no other route takes, and a browser opening a
 * console page such as `/board` gets `index.html`. `no-cache` makes the browser revalidate, so a deploy shows at once.
 */
const webConsole = Layer.unwrap(
  Effect.gen(function* () {
    const path = yield* Path.Path
    const root = yield* Effect.orDie(path.fromFileUrl(new URL("../../../web/dist", import.meta.url)))
    return HttpStaticServer.layer({ root, spa: true, cacheControl: "no-cache" })
  })
)

/** Every route of ras: the HTTP API with its OpenAPI document, the connector, the modules' own routes and the console. */
export const routes = Layer.mergeAll(
  HttpApiBuilder.layer(Api.Api, { openapiPath: "/openapi.json" }).pipe(
    Layer.provide(Api.HttpHandlers),
    Layer.provide(Global.session)
  ),
  Mcp.routes,
  Module.routes(Modules.modules),
  BackupRoute.routes.pipe(Layer.provide(GoogleIdTokens.layer)),
  health,
  webConsole
)

export const database = (filename: string) =>
  Layer.effectDiscard(Effect.orDie(Api.migrate)).pipe(Layer.provideMerge(SqliteClient.layer({ filename })))

export const serve = (options: { readonly port: number; readonly database: string }) =>
  Layer.merge(HttpRouter.serve(routes).pipe(Layer.provide(Api.Services)), Backup.nightly).pipe(
    Layer.provide(database(options.database)),
    Layer.provide(BunHttpServer.layer({ port: options.port }))
  )
