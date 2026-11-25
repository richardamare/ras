import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Time from "@ras/kernel/Time"
import * as KernelTesting from "@ras/kernel/Testing"
import * as Recurrence from "../../src/events/Recurrence.ts"
import * as GoogleWriter from "../../src/google/Writer.ts"
import * as OutlookWriter from "../../src/outlook/Writer.ts"

const day = (date: string) => Time.PragueDate.make(date)
const patternOf = (start: string, repeat: Parameters<typeof Recurrence.of>[1]) =>
  Effect.map(Recurrence.of(day(start), repeat), (recurrence) => OutlookWriter.recurrenceOf(recurrence).pattern)

const ruleOf = (start: string, repeat: Parameters<typeof Recurrence.of>[1], allDay = false) =>
  Effect.map(Recurrence.of(day(start), repeat), (recurrence) => GoogleWriter.ruleOf(recurrence, allDay))

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
        yield* KernelTesting.code(Recurrence.of(day("2026-11-17"), { every: "week", by: "weekday" })),
        "Invalid"
      )
    })
  )

  it.effect("spells a repeat as Google's RRULE, its end the last second of its last day in Prague", () =>
    Effect.gen(function* () {
      assert.strictEqual(
        yield* ruleOf("2026-11-17", {
          every: "week",
          on: ["tuesday", "thursday"],
          interval: 2,
          until: day("2026-12-31")
        }),
        "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;UNTIL=20261231T225959Z"
      )
      assert.strictEqual(
        yield* ruleOf("2026-11-27", { every: "month", by: "weekday", count: 5 }),
        "RRULE:FREQ=MONTHLY;BYDAY=-1FR;COUNT=5"
      )
      assert.strictEqual(
        yield* ruleOf("2026-11-02", { every: "year", by: "weekday" }),
        "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1MO"
      )
      assert.strictEqual(
        yield* ruleOf("2026-11-17", { every: "day", until: day("2026-11-20") }, true),
        "RRULE:FREQ=DAILY;UNTIL=20261120"
      )
      assert.strictEqual(
        yield* ruleOf("2026-07-01", { every: "month", until: day("2026-08-31") }),
        "RRULE:FREQ=MONTHLY;UNTIL=20260831T215959Z"
      )
    })
  )
})
