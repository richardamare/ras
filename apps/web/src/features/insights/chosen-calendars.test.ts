import * as Vitest from "vitest"

import * as ChosenCalendars from "@/features/insights/chosen-calendars"

Vitest.describe("the calendars chosen for insights", () => {
  Vitest.it("takes the calendars in the address over the ones this browser remembers", () => {
    Vitest.expect(ChosenCalendars.chosenOf([3], [1, 2], [1, 2, 3])).toEqual([3])
  })

  Vitest.it("restores the remembered calendars when the address names none", () => {
    Vitest.expect(ChosenCalendars.chosenOf(null, [1, 2], [1, 2, 3])).toEqual([1, 2])
  })

  Vitest.it("restores only the remembered calendars the page still lists", () => {
    Vitest.expect(ChosenCalendars.chosenOf(null, [1, 2, 4], [2, 3, 4])).toEqual([2, 4])
  })

  Vitest.it("ticks an unticked calendar and unticks a ticked one, in order", () => {
    Vitest.expect(ChosenCalendars.toggled([3, 1], 2)).toEqual([1, 2, 3])
    Vitest.expect(ChosenCalendars.toggled([1, 2], 1)).toEqual([2])
  })
})
