import * as Vitest from "vitest"

import * as Work from "@/features/tasks/work"

Vitest.describe("an estimate typed into the task dialog", () => {
  Vitest.test("reads hours and minutes, or plain minutes", () => {
    Vitest.expect(Work.minutesOf("1:30")).toBe(90)
    Vitest.expect(Work.minutesOf("0:05")).toBe(5)
    Vitest.expect(Work.minutesOf(" 45 ")).toBe(45)
  })

  Vitest.test("clears the estimate when the box is empty", () => {
    Vitest.expect(Work.minutesOf("  ")).toBeNull()
  })

  Vitest.test("refuses anything else", () => {
    Vitest.expect(Work.minutesOf("1:75")).toBeUndefined()
    Vitest.expect(Work.minutesOf("1.5")).toBeUndefined()
    Vitest.expect(Work.minutesOf("an hour")).toBeUndefined()
  })
})

Vitest.describe("the times the plan and log dialogs offer", () => {
  Vitest.test("a plan starts at the next half hour, for an hour", () => {
    Vitest.expect(Work.planDefaults("2026-11-17T09:10")).toEqual({ date: "2026-11-17", time: "09:30", minutes: 60 })
    Vitest.expect(Work.planDefaults("2026-11-17T09:30")).toEqual({ date: "2026-11-17", time: "09:30", minutes: 60 })
    Vitest.expect(Work.planDefaults("2026-11-17T23:45")).toEqual({ date: "2026-11-18", time: "00:00", minutes: 60 })
  })

  Vitest.test("a log covers the hour that just ended, to five minutes", () => {
    Vitest.expect(Work.logDefaults("2026-11-17T14:07")).toEqual({ date: "2026-11-17", from: "13:05", to: "14:05" })
  })

  Vitest.test("a log just after midnight starts at midnight", () => {
    Vitest.expect(Work.logDefaults("2026-11-17T00:20")).toEqual({ date: "2026-11-17", from: "00:00", to: "00:20" })
  })
})
