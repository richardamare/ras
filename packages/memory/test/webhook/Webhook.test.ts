import * as BunHttpServer from "@effect/platform-bun/BunHttpServer"
import * as BunServices from "@effect/platform-bun/BunServices"
import { assert, layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpRouter from "effect/http/HttpRouter"
import * as Testing from "@ras/global/testing"
import * as Module from "../../src/Module.ts"
import * as MemoryTesting from "../../src/Testing.ts"
import * as Webhook from "../../src/webhook/Webhook.ts"

const secret = "webhook-secret"

const App = Layer.unwrap(
  Effect.map(MemoryTesting.repositories, (repositories) =>
    HttpRouter.serve(Webhook.routes, { disableListenLog: true }).pipe(
      Layer.provide(
        Testing.layer([Module.module], { RAS_MEMORY_PATH: repositories.clone, RAS_MEMORY_WEBHOOK_SECRET: secret })
      )
    )
  )
).pipe(Layer.provideMerge(BunHttpServer.layerTest), Layer.provide(BunServices.layer))

const post = (event: string, body: string, signature: string) =>
  HttpClient.execute(
    HttpClientRequest.post(Webhook.path).pipe(
      HttpClientRequest.setHeaders({ "x-github-event": event, "x-hub-signature-256": signature }),
      HttpClientRequest.bodyText(body, "application/json")
    )
  ).pipe(Effect.map((response) => response.status))

const sign = (body: string) => `sha256=${new Bun.CryptoHasher("sha256", secret).update(body).digest("hex")}`

layer(App)("the GitHub webhook", (test) => {
  test.effect("refuses a push whose signature does not match", () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* post("push", "{}", "sha256=00"), 401)
    })
  )

  test.effect("accepts a signed push and answers a signed ping without syncing", () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* post("push", "{}", sign("{}")), 202)
      assert.strictEqual(yield* post("ping", "{}", sign("{}")), 204)
    })
  )
})
