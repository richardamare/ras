import * as Vitest from "vitest"

import * as Pointer from "@/features/calendar/lib/pointer"
import type * as Api from "@/lib/api/generated/types.gen"

const calendars: ReadonlyArray<Api.CalendarEncoded> = [
  { id: 1, name: "Work", color: "#0078d4", writable: true, enabled: true },
  { id: 2, name: "Family", color: "#e3008c", writable: false, enabled: true }
]

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

const block = (state: Api.BlockEncoded["state"]): Api.BlockEncoded => ({
  id: "block",
  task: "task",
  title: "ras: task",
  calendar: 1,
  start: "2026-11-17T09:00",
  end: "2026-11-17T10:00",
  state
})

Vitest.describe("the pointer on the time grid", () => {
  Vitest.test("a move snaps to the quarter hour and stays inside the day", () => {
    Vitest.expect(Pointer.moved("2026-11-17", 60, 10, 547)).toEqual({ day: "2026-11-17", start: 540, end: 600 })
    Vitest.expect(Pointer.moved("2026-11-17", 60, 0, 1430)).toEqual({ day: "2026-11-17", start: 1380, end: 1440 })
  })

  Vitest.test("a resize keeps at least a quarter hour", () => {
    Vitest.expect(Pointer.resized("2026-11-17", 540, 500)).toEqual({ day: "2026-11-17", start: 540, end: 555 })
  })

  Vitest.test("a drag upward across empty time spans from the lower quarter hour", () => {
    Vitest.expect(Pointer.spanned("2026-11-17", 600, 540)).toEqual({ day: "2026-11-17", start: 540, end: 600 })
  })

  Vitest.test("a span ending at midnight ends on the next day", () => {
    Vitest.expect(Pointer.span({ day: "2026-11-17", start: 1380, end: 1440 })).toEqual({
      start: "2026-11-17T23:00",
      end: "2026-11-18T00:00"
    })
  })

  Vitest.test("the pointer past the grid's edge lands in the nearest column", () => {
    const columns = [
      { day: "a", left: 100, right: 200 },
      { day: "b", left: 200, right: 300 }
    ]
    Vitest.expect([50, 250, 400].map((x) => Pointer.columnAt(x, columns))).toEqual(["a", "b", "b"])
  })
})

Vitest.describe("the calendar rules in the console", () => {
  Vitest.test("a plain event of a writable calendar can be dragged", () => {
    Vitest.expect(Pointer.draggable({ kind: "event", event: event({}) }, calendars)).toBe(true)
  })

  Vitest.test("an event of a calendar ras does not write, an invitation and a series cannot", () => {
    Vitest.expect(
      [event({ calendar: 2 }), event({ kind: "invitation" }), event({ recurring: true })].map((one) =>
        Pointer.draggable({ kind: "event", event: one }, calendars)
      )
    ).toEqual([false, false, false])
  })

  Vitest.test("a planned or draft block can be dragged and a running or done one cannot", () => {
    Vitest.expect(
      (["planned", "draft", "running", "done"] as const).map((state) =>
        Pointer.draggable({ kind: "block", block: block(state) }, calendars)
      )
    ).toEqual([true, true, false, false])
  })
})
