import * as BunHttpServer from "@effect/platform-bun/BunHttpServer"
import { assert, describe, layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder"
import * as HttpApiClient from "effect/http-api/HttpApiClient"
import * as HttpApiError from "effect/http-api/HttpApiError"
import * as Global from "@ras/global"
import * as Testing from "@ras/global/testing"
import * as Api from "../src/Api.ts"
import * as Modules from "../src/Modules.ts"

const served = (authenticated: Layer.Layer<Global.Authenticated>) =>
  HttpRouter.serve(HttpApiBuilder.layer(Api.Api).pipe(Layer.provide(Api.HttpHandlers)), {
    disableListenLog: true
  }).pipe(
    Layer.provide(Api.Services),
    Layer.provide(Testing.database(Modules.modules.slice(1))),
    Layer.provide(authenticated),
    Layer.provideMerge(BunHttpServer.layerTest)
  )

const refused = Layer.succeed(Global.Authenticated, () => Effect.fail(new HttpApiError.Unauthorized()))

describe("the composed API", () => {
  layer(served(Testing.signedIn))("signed in", (test) => {
    test.effect("answers whoami with the owner at the console", () =>
      Effect.gen(function* () {
        const client = yield* HttpApiClient.make(Api.Api)
        assert.deepStrictEqual(yield* client.global.whoami(), { channel: "Console", agent: null })
      })
    )
  })

  layer(served(refused))("without a session", (test) => {
    test.effect("refuses every endpoint with 401", () =>
      Effect.gen(function* () {
        const client = yield* HttpApiClient.make(Api.Api)
        const error = yield* Effect.flip(client.global.whoami())
        assert.strictEqual(error._tag, "Unauthorized")
      })
    )
  })
})
