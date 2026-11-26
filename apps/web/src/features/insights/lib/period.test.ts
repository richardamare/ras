import * as Vitest from "vitest"

import * as Period from "@/features/insights/lib/period"

Vitest.describe("insights period", () => {
  Vitest.it("steps a week by seven days, a month by one and a quarter by three", () => {
    Vitest.expect(Period.step("week", "2026-11-22", -1)).toBe("2026-11-15")
    Vitest.expect(Period.step("month", "2026-01-31", 1)).toBe("2026-02-01")
    Vitest.expect(Period.step("quarter", "2026-11-22", 1)).toBe("2027-01-01")
    Vitest.expect(Period.step("quarter", "2026-02-10", -1)).toBe("2025-10-01")
  })

  Vitest.it("tells whether a day falls in the period of another", () => {
    Vitest.expect(Period.contains("week", "2026-11-16", "2026-11-22")).toBe(true)
    Vitest.expect(Period.contains("week", "2026-11-16", "2026-11-23")).toBe(false)
    Vitest.expect(Period.contains("month", "2026-11-01", "2026-11-30")).toBe(true)
    Vitest.expect(Period.contains("quarter", "2026-10-01", "2026-12-31")).toBe(true)
    Vitest.expect(Period.contains("quarter", "2026-10-01", "2026-09-30")).toBe(false)
  })
})
