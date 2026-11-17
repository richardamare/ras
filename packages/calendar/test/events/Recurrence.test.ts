import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Time from "@ras/kernel/Time"
import * as KernelTesting from "@ras/kernel/Testing"
import * as Events from "../../src/events/Events.ts"

const day = (date: string) => Time.PragueDate.make(date)
const patternOf = (start: string, repeat: Parameters<typeof Events.recurrenceOf>[1]) =>
  Effect.map(Events.recurrenceOf(day(start), repeat), (recurrence) => recurrence.pattern)

describe("a repeat's recurrence", () => {
  it.effect("repeats monthly on the start's day of the month", () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(yield* patternOf("2026-11-17", { every: "month" }), {
        type: "absoluteMonthly",
        interval: 1,
        dayOfMonth: 17
      })
    })
  )

  it.effect("repeats monthly on the start's weekday at its place in the month", () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(yield* patternOf("2026-11-17", { every: "month", by: "weekday", interval: 2 }), {
        type: "relativeMonthly",
        interval: 2,
        daysOfWeek: ["tuesday"],
        index: "third"
      })
    })
  )

  it.effect("calls a day in the month's final week its last", () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(yield* patternOf("2026-11-27", { every: "month", by: "weekday" }), {
        type: "relativeMonthly",
        interval: 1,
        daysOfWeek: ["friday"],
        index: "last"
      })
      assert.deepStrictEqual(yield* patternOf("2026-11-23", { every: "month", by: "weekday" }), {
        type: "relativeMonthly",
        interval: 1,
        daysOfWeek: ["monday"],
        index: "fourth"
      })
    })
  )

  it.effect("repeats yearly on the start's weekday in its month", () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(yield* patternOf("2026-11-02", { every: "year", by: "weekday" }), {
        type: "relativeYearly",
        interval: 1,
        daysOfWeek: ["monday"],
        index: "first",
        month: 11
      })
    })
  )

  it.effect("refuses by on a daily or weekly repeat", () =>
    Effect.gen(function* () {
      assert.strictEqual(
        yield* KernelTesting.code(Events.recurrenceOf(day("2026-11-17"), { every: "week", by: "weekday" })),
        "Invalid"
      )
    })
  )
})
