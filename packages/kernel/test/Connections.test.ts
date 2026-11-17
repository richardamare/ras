import { assert, describe, it } from "@effect/vitest"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"
import * as Connections from "../src/Connections.ts"
import * as Errors from "../src/Errors.ts"
import * as Module from "../src/Module.ts"

const env = (record: Record<string, string>) => ConfigProvider.layer(ConfigProvider.fromEnvRecord(record))

const live = env({})

describe("Connections", () => {
  it.effect("checks a connected source by reaching it", () =>
    Effect.gen(function* () {
      const probes = yield* Ref.make(0)
      const source = yield* Connections.source(
        "reclaim",
        Effect.succeed(Connections.connected("reclaim")),
        Ref.update(probes, (count) => count + 1)
      )
      assert.strictEqual((yield* source.state).state, "connected")
      assert.strictEqual(yield* Ref.get(probes), 0)
      assert.strictEqual((yield* source.check).state, "connected")
      assert.strictEqual(yield* Ref.get(probes), 1)
    }).pipe(Effect.provide(live))
  )

  it.effect("reports a source it could not reach as failing, with the reason", () =>
    Effect.gen(function* () {
      const source = yield* Connections.source(
        "icloud",
        Effect.succeed(Connections.connected("icloud", "owner@icloud.com")),
        Effect.fail(new Errors.SourceFailed({ source: "icloud", reason: "iCloud refused the password." }))
      )
      const checked = yield* source.check
      assert.deepStrictEqual([checked.state, checked.detail], ["failing", "iCloud refused the password."])
    }).pipe(Effect.provide(live))
  )

  it.effect("leaves a source without its settings unreached", () =>
    Effect.gen(function* () {
      const source = yield* Connections.source(
        "github",
        Effect.succeed(Connections.notConfigured("github", "The clone has no upstream.")),
        Effect.die("reached")
      )
      const checked = yield* source.check
      assert.deepStrictEqual([checked.state, checked.detail], ["notConfigured", "The clone has no upstream."])
    }).pipe(Effect.provide(live))
  )

  it.effect("answers sample in sample mode and reaches nothing", () =>
    Effect.gen(function* () {
      const source = yield* Connections.source("outlook", Effect.die("read"), Effect.die("reached"))
      assert.strictEqual((yield* source.state).state, "sample")
      assert.strictEqual((yield* source.check).state, "sample")
    }).pipe(Effect.provide(env({ RAS_SAMPLE: "true" })))
  )

  it.effect("lists every module's sources in a fixed order", () =>
    Effect.gen(function* () {
      const fixed = (kind: Connections.Kind) =>
        Connections.source(kind, Effect.succeed(Connections.connected(kind)), Effect.void)
      const first = Module.make({ name: "first", connections: [fixed("github")] })
      const second = Module.make({ name: "second", connections: [fixed("icloud"), fixed("outlook")] })
      const connections = yield* Effect.provide(
        Effect.service(Connections.Connections),
        Module.services([first, second])
      )
      assert.deepStrictEqual(
        (yield* connections.list).map((one) => one.kind),
        ["outlook", "icloud", "github"]
      )
      assert.strictEqual((yield* connections.check("reclaim")).state, "notConfigured")
    }).pipe(Effect.provide(live))
  )
})
