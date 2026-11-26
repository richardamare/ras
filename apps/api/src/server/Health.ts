import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpServerResponse from "effect/http/HttpServerResponse"

/** What `/health` answers, and the instance answering it. */
export const Health = Schema.Struct({ ok: Schema.Boolean, instance: Schema.String })
export type Health = typeof Health.Type

/** `instance` is fresh in every process, so a caller sees when another instance answers, as after a cold start. */
export const routes = Layer.unwrap(
  Effect.sync(() => {
    const health: Health = { ok: true, instance: crypto.randomUUID() }
    return HttpRouter.add("GET", "/health", Effect.orDie(HttpServerResponse.schemaJson(Health)(health)))
  })
)
