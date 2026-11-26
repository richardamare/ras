import * as Vitest from "vitest"

import * as HiddenCalendars from "@/features/calendar/lib/hidden-calendars"

Vitest.describe("hidden calendars", () => {
  Vitest.it("hides a shown calendar and shows a hidden one", () => {
    Vitest.expect([...HiddenCalendars.toggled(new Set([1]), 2)]).toEqual([1, 2])
    Vitest.expect([...HiddenCalendars.toggled(new Set([1, 2]), 1)]).toEqual([2])
  })
})
