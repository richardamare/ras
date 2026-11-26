import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import type * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import type * as Path from "effect/Path"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpServerRequest from "effect/http/HttpServerRequest"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import type * as SqlClient from "effect/sql/SqlClient"
import * as Backup from "./Backup.ts"
import * as GoogleIdTokens from "./GoogleIdTokens.ts"

export const path = "/backup"

const bearer = (authorization: string | undefined) =>
  Option.map(
    Option.filter(Option.fromUndefinedOr(authorization), (value) => value.startsWith("Bearer ")),
    (value) => value.slice("Bearer ".length)
  )

/**
 * Backs the database up when Cloud Scheduler asks: the caller holds a Google ID token for this route's URL under
 * `RAS_URL`, issued to the service account `RAS_BACKUP_SCHEDULER_ACCOUNT`. Without that account set the route does not
 * exist.
 */
export const routes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const account = yield* Config.option(Config.String("RAS_BACKUP_SCHEDULER_ACCOUNT")).pipe(Effect.orDie)
    if (Option.isNone(account)) return
    const audience = new URL(path, yield* Config.URL("RAS_URL").pipe(Effect.orDie)).href
    const tokens = yield* GoogleIdTokens.GoogleIdTokens
    const services = yield* Effect.context<SqlClient.SqlClient | FileSystem.FileSystem | Path.Path>()
    yield* router.add(
      "POST",
      path,
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const token = bearer(request.headers["authorization"])
        if (Option.isNone(token)) return HttpServerResponse.empty({ status: 401 })
        const claims = yield* tokens.verify(token.value)
        if (claims.aud !== audience || claims.email !== account.value) return HttpServerResponse.empty({ status: 403 })
        yield* Effect.provide(Backup.run, services)
        return HttpServerResponse.empty({ status: 204 })
      }).pipe(
        Effect.catchTags({
          InvalidToken: (error) =>
            Effect.as(
              Effect.logWarning("A backup was asked with an invalid token.", error.reason),
              HttpServerResponse.empty({ status: 401 })
            ),
          SourceFailed: (error) => Effect.as(Effect.logError(error.reason), HttpServerResponse.empty({ status: 503 }))
        }),
        Effect.catchCause((cause) =>
          Effect.as(Effect.logError("The backup failed.", cause), HttpServerResponse.empty({ status: 500 }))
        )
      )
    )
  })
)
