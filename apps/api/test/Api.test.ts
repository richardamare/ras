import * as BunHttpServer from "@effect/platform-bun/BunHttpServer"
import * as BunServices from "@effect/platform-bun/BunServices"
import { assert, describe, layer } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder"
import * as HttpApiClient from "effect/http-api/HttpApiClient"
import * as HttpApiError from "effect/http-api/HttpApiError"
import * as Global from "@ras/global"
import * as Testing from "@ras/global/testing"
import * as Time from "@ras/kernel/Time"
import * as MemoryTesting from "@ras/memory/testing"
import * as Api from "../src/Api.ts"
import * as Modules from "../src/Modules.ts"

const served = (authenticated: Layer.Layer<Global.Authenticated>) =>
  Layer.unwrap(
    Effect.map(MemoryTesting.repositories, (repositories) =>
      HttpRouter.serve(HttpApiBuilder.layer(Api.Api).pipe(Layer.provide(Api.HttpHandlers)), {
        disableListenLog: true
      }).pipe(
        Layer.provide(Api.Services),
        Layer.provide(Testing.database(Modules.modules.slice(1))),
        Layer.provide(authenticated),
        Layer.provide(Testing.settingsWith({ RAS_MEMORY_PATH: repositories.clone, RAS_SAMPLE: "true" })),
        Layer.provideMerge(BunHttpServer.layerTest)
      )
    )
  ).pipe(Layer.provide(BunServices.layer))

const refused = Layer.succeed(Global.Authenticated, () => Effect.fail(new HttpApiError.Unauthorized()))

describe("the composed API", () => {
  layer(served(Testing.signedIn))("signed in", (test) => {
    test.effect("answers whoami with the owner at the console", () =>
      Effect.gen(function* () {
        const client = yield* HttpApiClient.make(Api.Api)
        assert.deepStrictEqual(yield* client.global.whoami(), { channel: "Console", agent: null })
      })
    )

    test.effect("gives a calendar its role and serves the calendars' events", () =>
      Effect.gen(function* () {
        const client = yield* HttpApiClient.make(Api.Api)
        const [personal] = yield* client.calendar.calendars({ query: {} })
        const changed = yield* client.calendar.changeCalendar({
          params: { id: personal!.id },
          payload: { role: "personal" }
        })
        assert.strictEqual(changed.role, "personal")
        const day = Time.pragueDateOf(yield* DateTime.now)
        const events = yield* client.calendar.events({
          query: { from: Time.PragueLocal.make(`${day}T00:00`), to: Time.PragueLocal.make(`${day}T23:59`) }
        })
        assert.deepStrictEqual(
          events.map((event) => event.title),
          ["Standup", "Lunch"]
        )
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
