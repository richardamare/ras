import { assert, describe, it } from "@effect/vitest"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Errors from "@ras/kernel/Errors"
import * as OutlookConnection from "../../src/outlook/Connection.ts"
import * as Outlook from "../../src/outlook/Outlook.ts"
import * as ReclaimConnection from "../../src/reclaim/Connection.ts"
import * as Reclaim from "../../src/reclaim/Reclaim.ts"

const refused = (source: string) => Effect.fail(new Errors.SourceFailed({ source, reason: `${source} refused ras.` }))

const outlook = (account: Option.Option<string>) =>
  Layer.succeed(
    Outlook.Outlook,
    Outlook.Outlook.of({
      create: () => Effect.die("unused"),
      change: () => Effect.die("unused"),
      cancel: () => Effect.die("unused"),
      occurrence: () => Effect.die("unused"),
      account: Effect.succeed(account),
      reach: refused("graph")
    })
  )

const reclaim = Layer.succeed(
  Reclaim.Reclaim,
  Reclaim.Reclaim.of({
    calendars: refused("reclaim"),
    events: () => Effect.die("unused"),
    providerId: () => Effect.die("unused"),
    reply: () => Effect.die("unused")
  })
)

const env = (record: Record<string, string>) => ConfigProvider.layer(ConfigProvider.fromEnvRecord(record))

describe("Connections", () => {
  it.effect("asks for an Outlook account until one is connected", () =>
    Effect.gen(function* () {
      const source = yield* OutlookConnection.outlook
      const checked = yield* source.check
      assert.deepStrictEqual(
        [checked.state, checked.detail],
        ["notConfigured", "No Outlook account is connected to ras yet."]
      )
    }).pipe(Effect.provide(Layer.merge(outlook(Option.none()), env({}))))
  )

  it.effect("names the connected Outlook account, and reports it failing when Graph refuses", () =>
    Effect.gen(function* () {
      const source = yield* OutlookConnection.outlook
      const known = yield* source.state
      assert.deepStrictEqual([known.state, known.detail], ["connected", "owner@outlook.com"])
      const checked = yield* source.check
      assert.deepStrictEqual([checked.state, checked.detail], ["failing", "graph refused ras."])
    }).pipe(Effect.provide(Layer.merge(outlook(Option.some("owner@outlook.com")), env({}))))
  )

  it.effect("asks for Reclaim's API key without reaching Reclaim", () =>
    Effect.gen(function* () {
      const checked = yield* (yield* ReclaimConnection.reclaim).check
      assert.deepStrictEqual(
        [checked.state, checked.detail],
        ["notConfigured", "ras has no Reclaim API key. Set RAS_RECLAIM_API_KEY."]
      )
    }).pipe(Effect.provide(Layer.merge(reclaim, env({}))))
  )

  it.effect("reports Reclaim failing when it refuses the key", () =>
    Effect.gen(function* () {
      const source = yield* ReclaimConnection.reclaim
      assert.strictEqual((yield* source.state).state, "connected")
      assert.strictEqual((yield* source.check).state, "failing")
    }).pipe(Effect.provide(Layer.merge(reclaim, env({ RAS_RECLAIM_API_KEY: "key" }))))
  )
})
