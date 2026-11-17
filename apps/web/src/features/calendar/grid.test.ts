import * as Vitest from "vitest"

import * as Grid from "@/features/calendar/grid"
import type * as Api from "@/lib/api/generated/types.gen"

const event = (overrides: Partial<Api.EventEncoded>): Api.EventEncoded => ({
  id: "event",
  calendar: 1,
  title: "Meeting",
  start: "2026-11-17T09:00",
  end: "2026-11-17T10:00",
  allDay: false,
  kind: "plain",
  showAs: "busy",
  rsvp: "none",
  cancelled: false,
  recurring: false,
  location: null,
  category: null,
  notes: null,
  attendees: [],
  copyOf: null,
  block: null,
  draft: null,
  ...overrides
})

const block = (overrides: Partial<Api.BlockEncoded>): Api.BlockEncoded => ({
  id: "block",
  task: "task",
  title: "ras: Ship the console",
  calendar: 1,
  start: "2026-11-17T13:00",
  end: "2026-11-17T14:00",
  state: "planned",
  ...overrides
})

Vitest.describe("the calendar's days", () => {
  Vitest.test("a week runs Monday to Sunday around its day", () => {
    Vitest.expect(Grid.daysOf("week", "2026-11-19")).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22"
    ])
  })

  Vitest.test("a month runs through whole weeks at both ends, across the change of clocks too", () => {
    const days = Grid.daysOf("month", "2026-10-15")
    Vitest.expect([days[0], days.at(-1), days.length]).toEqual(["2026-09-28", "2026-11-01", 35])
  })

  Vitest.test("a month steps to the first of the next or the previous month, past a year's end", () => {
    Vitest.expect([Grid.step("month", "2026-12-31", 1), Grid.step("month", "2026-01-31", -1)]).toEqual([
      "2027-01-01",
      "2025-12-01"
    ])
  })

  Vitest.test("a view asks for its first midnight up to the midnight after its last day", () => {
    Vitest.expect(Grid.windowOf(Grid.daysOf("day", "2026-11-17"))).toEqual({
      from: "2026-11-17T00:00",
      to: "2026-11-18T00:00"
    })
  })
})

Vitest.describe("the calendar's columns", () => {
  Vitest.test("an all-day event shows on each of its days and not on the day its end names", () => {
    const trip = event({ allDay: true, start: "2026-11-17T00:00", end: "2026-11-19T00:00" })
    const columns = Grid.dayColumns([trip], [], ["2026-11-17", "2026-11-18", "2026-11-19"], "2026-11-17T08:00")
    Vitest.expect(columns.map((column) => column.allDay.length)).toEqual([1, 1, 0])
  })

  Vitest.test("an event across midnight is cut at each day's edge", () => {
    const night = event({ start: "2026-11-17T22:00", end: "2026-11-18T02:00" })
    const columns = Grid.dayColumns([night], [], ["2026-11-17", "2026-11-18"], "2026-11-17T08:00")
    Vitest.expect(columns.map((column) => [column.timed[0]?.startsAt, column.timed[0]?.endsAt])).toEqual([
      [1320, 1440],
      [0, 120]
    ])
  })

  Vitest.test("overlapping items split the column and a later free item takes the whole width", () => {
    const [column] = Grid.dayColumns(
      [
        event({ id: "a" }),
        event({ id: "b", start: "2026-11-17T09:30" }),
        event({ id: "c", start: "2026-11-17T11:00", end: "2026-11-17T12:00" })
      ],
      [],
      ["2026-11-17"],
      "2026-11-17T08:00"
    )
    Vitest.expect(column?.timed.map((placed) => [placed.key, placed.lane, placed.lanes])).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 0, 1]
    ])
  })

  Vitest.test("a running block reaches to now and a zero-length event keeps a quarter hour", () => {
    const [column] = Grid.dayColumns(
      [event({ start: "2026-11-17T08:00", end: "2026-11-17T08:00" })],
      [block({ start: "2026-11-17T10:00", end: null, state: "running" })],
      ["2026-11-17"],
      "2026-11-17T11:30"
    )
    Vitest.expect(column?.timed.map((placed) => [placed.startsAt, placed.endsAt])).toEqual([
      [480, 495],
      [600, 690]
    ])
  })

  Vitest.test("a day with a draft event or block offers to confirm it", () => {
    const columns = Grid.dayColumns(
      [event({ draft: { refusal: null } })],
      [block({ start: "2026-11-18T09:00", end: "2026-11-18T10:00", state: "draft" })],
      ["2026-11-17", "2026-11-18", "2026-11-19"],
      "2026-11-17T08:00"
    )
    Vitest.expect(columns.map(Grid.hasDrafts)).toEqual([true, true, false])
  })

  Vitest.test("a block's own event is left out for the block", () => {
    Vitest.expect(
      Grid.shownEvents([event({ id: "a" }), event({ id: "b", block: "block" })]).map((one) => one.id)
    ).toEqual(["a"])
  })
})
