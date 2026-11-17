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
