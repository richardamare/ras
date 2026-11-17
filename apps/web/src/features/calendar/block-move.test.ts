import * as Vitest from "vitest"

import * as BlockMove from "@/features/calendar/block-move"

const block = {
  id: "b1",
  task: "t1",
  title: "ras · Calendar",
  calendar: 1,
  start: "2026-11-17T09:00",
  end: "2026-11-17T10:30",
  state: "planned" as const
}

Vitest.describe("block move", () => {
  Vitest.it("starts from the block's day and times", () => {
    Vitest.expect(BlockMove.formOf(block)).toEqual({ day: "2026-11-17", start: "09:00", end: "10:30" })
  })

  Vitest.it("moves the block to the chosen day and times", () => {
    Vitest.expect(BlockMove.spanOf({ day: "2026-11-19", start: "14:00", end: "15:30" })).toEqual({
      start: "2026-11-19T14:00",
      end: "2026-11-19T15:30"
    })
  })

  Vitest.it("refuses an end that is not after the start", () => {
    Vitest.expect(BlockMove.spanOf({ day: "2026-11-19", start: "14:00", end: "14:00" })).toBeUndefined()
    Vitest.expect(BlockMove.spanOf({ day: "2026-11-19", start: "14:00", end: "13:00" })).toBeUndefined()
  })
})
