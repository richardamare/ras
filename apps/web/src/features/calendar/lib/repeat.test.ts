import * as Vitest from "vitest"

import * as Repeat from "@/features/calendar/lib/repeat"

const tuesday = "2026-11-17"

Vitest.describe("repeat", () => {
  Vitest.it("reads the weekday of a day in any zone", () => {
    Vitest.expect(Repeat.weekdayOf(tuesday)).toBe("tuesday")
    Vitest.expect(Repeat.weekdayOf("2026-11-22")).toBe("sunday")
    Vitest.expect(Repeat.weekdayOf("2026-03-30")).toBe("monday")
  })

  Vitest.it("places a day among its weekday's days in the month, the final week as the last", () => {
    Vitest.expect(Repeat.placeOf("2026-11-02")).toBe(1)
    Vitest.expect(Repeat.placeOf(tuesday)).toBe(3)
    Vitest.expect(Repeat.placeOf("2026-11-23")).toBe(4)
    Vitest.expect(Repeat.placeOf("2026-11-24")).toBe(5)
    Vitest.expect(Repeat.placeOf("2026-02-28")).toBe(5)
  })

  Vitest.it("starts with no repeat and the event's own weekday", () => {
    const form = Repeat.initial(tuesday)
    Vitest.expect(form.on).toEqual(["tuesday"])
    Vitest.expect(Repeat.presetOf(form, tuesday)).toBe("never")
    Vitest.expect(Repeat.repeatOf(form)).toBeUndefined()
  })

  Vitest.it("turns each quick choice into its repeat and recognises it again", () => {
    const form = Repeat.initial(tuesday)
    const expected = {
      daily: { every: "day" },
      workdays: { every: "week", on: ["monday", "tuesday", "wednesday", "thursday", "friday"] },
      weekly: { every: "week", on: ["tuesday"] },
      monthly: { every: "month" },
      yearly: { every: "year" }
    } as const
    for (const [preset, repeat] of Object.entries(expected)) {
      const applied = Repeat.applyPreset(form, preset as Repeat.Preset, tuesday)
      Vitest.expect(Repeat.repeatOf(applied)).toEqual(repeat)
      Vitest.expect(Repeat.presetOf(applied, tuesday)).toBe(preset)
    }
  })

  Vitest.it("calls a repeat no quick choice makes custom", () => {
    const weekly = Repeat.applyPreset(Repeat.initial(tuesday), "weekly", tuesday)
    Vitest.expect(Repeat.presetOf({ ...weekly, interval: 2 }, tuesday)).toBe("custom")
    Vitest.expect(Repeat.presetOf({ ...weekly, on: ["tuesday", "thursday"] }, tuesday)).toBe("custom")
    Vitest.expect(Repeat.presetOf({ ...weekly, every: "month", by: "weekday" }, tuesday)).toBe("custom")
  })

  Vitest.it("keeps the repeat a custom choice starts from, and turns one on when there is none", () => {
    const monthly = Repeat.applyPreset(Repeat.initial(tuesday), "monthly", tuesday)
    Vitest.expect(Repeat.applyPreset(monthly, "custom", tuesday)).toEqual(monthly)
    Vitest.expect(Repeat.applyPreset(Repeat.initial(tuesday), "custom", tuesday).every).toBe("week")
  })

  Vitest.it("toggles a weekday and keeps the week's order", () => {
    Vitest.expect(Repeat.toggle(["friday"], "monday")).toEqual(["monday", "friday"])
    Vitest.expect(Repeat.toggle(["monday", "friday"], "monday")).toEqual(["friday"])
  })

  Vitest.it("sends the interval, the weekdays and the place in the month only where they apply", () => {
    const form = {
      ...Repeat.initial(tuesday),
      interval: 2,
      on: ["monday", "wednesday"] as const,
      by: "weekday" as const
    }
    Vitest.expect(Repeat.repeatOf({ ...form, every: "week" })).toEqual({
      every: "week",
      interval: 2,
      on: ["monday", "wednesday"]
    })
    Vitest.expect(Repeat.repeatOf({ ...form, every: "month" })).toEqual({ every: "month", interval: 2, by: "weekday" })
    Vitest.expect(Repeat.repeatOf({ ...form, every: "day" })).toEqual({ every: "day", interval: 2 })
  })

  Vitest.it("ends on a day or after a count", () => {
    const form = { ...Repeat.initial(tuesday), every: "year" as const }
    Vitest.expect(Repeat.repeatOf({ ...form, end: "until", until: "2030-11-17" })).toEqual({
      every: "year",
      until: "2030-11-17"
    })
    Vitest.expect(Repeat.repeatOf({ ...form, end: "count", count: 5 })).toEqual({ every: "year", count: 5 })
  })
})
