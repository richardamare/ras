import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Mac from "effect/crypto/Mac"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpServerRequest from "effect/http/HttpServerRequest"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as Memory from "./Memory.ts"

export const path = "/webhooks/github"

const signature = (secret: Redacted.Redacted, body: string) =>
  `sha256=${new Bun.CryptoHasher("sha256", Redacted.value(secret)).update(body).digest("hex")}`

const encoder = new TextEncoder()

/**
 * GitHub's push webhook of the memory repository, signed with `RAS_MEMORY_WEBHOOK_SECRET`. A push makes ras pull and
 * rebuild the search index; without the secret set the route does not exist.
 */
export const routes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const secret = yield* Config.option(Config.Redacted("RAS_MEMORY_WEBHOOK_SECRET")).pipe(Effect.orDie)
    if (Option.isNone(secret)) return
    const memory = yield* Memory.Memory
    yield* router.add(
      "POST",
      path,
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const body = yield* request.text
        const signed = request.headers["x-hub-signature-256"] ?? ""
        const valid = Mac.timingSafeEqual(encoder.encode(signed), encoder.encode(signature(secret.value, body)))
        if (!valid) return HttpServerResponse.empty({ status: 401 })
        if (request.headers["x-github-event"] !== "push") return HttpServerResponse.empty({ status: 204 })
        yield* Effect.forkDetach(Effect.ignoreCause(memory.sync, { log: true }))
        return HttpServerResponse.empty({ status: 202 })
      }).pipe(Effect.catchTag("HttpServerError", () => Effect.succeed(HttpServerResponse.empty({ status: 400 }))))
    )
  })
)
