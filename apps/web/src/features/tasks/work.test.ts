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

Vitest.describe("the block the add dialog offers", () => {
  Vitest.test("is an hour from the quarter hour now falls in", () => {
    Vitest.expect(Work.blockDefaults("2026-11-17T09:10")).toEqual({ date: "2026-11-17", from: "09:00", to: "10:00" })
    Vitest.expect(Work.blockDefaults("2026-11-17T16:45")).toEqual({ date: "2026-11-17", from: "16:45", to: "17:45" })
  })

  Vitest.test("ends at the day's last minute late in the evening", () => {
    Vitest.expect(Work.blockDefaults("2026-11-17T23:20")).toEqual({ date: "2026-11-17", from: "23:15", to: "23:59" })
  })
})
