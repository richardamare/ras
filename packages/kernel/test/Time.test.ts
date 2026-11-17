import { assert, describe, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Time from "../src/Time.ts"

describe("Time", () => {
  it.effect("reads a Prague local time in winter and in summer", () =>
    Effect.gen(function* () {
      const winter = yield* Time.toInstant(Time.PragueLocal.make("2027-01-15T09:00"))
      const summer = yield* Time.toInstant(Time.PragueLocal.make("2027-07-15T09:00"))
      assert.strictEqual(DateTime.formatIso(winter), "2027-01-15T08:00:00.000Z")
      assert.strictEqual(DateTime.formatIso(summer), "2027-07-15T07:00:00.000Z")
    })
  )

  it.effect("refuses a time the spring change skips", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(Time.toInstant(Time.PragueLocal.make("2027-03-28T02:30")))
      assert.isTrue(Exit.isFailure(exit))
    })
  )

  it.effect("refuses a time the autumn change repeats", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(Time.toInstant(Time.PragueLocal.make("2027-10-31T02:30")))
      assert.isTrue(Exit.isFailure(exit))
    })
  )

  it.effect("writes an instant back as Prague local time", () =>
    Effect.gen(function* () {
      const instant = yield* Time.toInstant(Time.PragueLocal.make("2027-07-15T09:00"))
      assert.strictEqual(Time.toPragueLocal(instant), "2027-07-15T09:00")
    })
  )
  it("starts a Prague day at local midnight on either side of a daylight-saving change", () => {
    assert.strictEqual(
      DateTime.formatIso(Time.pragueMidnight(Time.PragueDate.make("2027-03-28"))),
      "2027-03-27T23:00:00.000Z"
    )
    assert.strictEqual(
      DateTime.formatIso(Time.pragueMidnight(Time.PragueDate.make("2027-03-29"))),
      "2027-03-28T22:00:00.000Z"
    )
    assert.strictEqual(Time.pragueDateOf(DateTime.makeUnsafe("2027-03-28T22:30:00Z")), "2027-03-29")
    assert.strictEqual(Time.addDays(Time.PragueDate.make("2027-02-28"), 1), "2027-03-01")
  })
})
