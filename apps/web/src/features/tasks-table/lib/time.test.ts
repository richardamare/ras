import * as Vitest from "vitest"

import type * as Api from "@/lib/api/generated/types.gen"
import * as Time from "@/features/tasks-table/lib/time"

const block = (overrides: Partial<Api.BlockEncoded>): Api.BlockEncoded => ({
  id: "block",
  task: "task",
  title: "ras: task",
  calendar: 1,
  start: "2026-11-17T09:00",
  end: "2026-11-17T10:00",
  state: "done",
  ...overrides
})

Vitest.describe("a task's time", () => {
  Vitest.test("adds up the done blocks and leaves out the running and the planned ones", () => {
    const times = Time.timeOf([
      block({ start: "2026-11-16T09:00", end: "2026-11-16T10:30" }),
      block({ start: "2026-11-17T09:00", end: "2026-11-17T09:45" }),
      block({ start: "2026-11-17T11:00", end: null, state: "running" }),
      block({ start: "2026-11-18T09:00", end: "2026-11-18T10:00", state: "planned" })
    ])
    Vitest.expect(times.get("task")?.spent).toBe(135)
  })

  Vitest.test("names the earliest planned or draft block as the next one", () => {
    const times = Time.timeOf([
      block({ start: "2026-11-20T09:00", end: "2026-11-20T10:00", state: "planned" }),
      block({ start: "2026-11-19T13:00", end: "2026-11-19T14:00", state: "draft" }),
      block({ start: "2026-11-16T09:00", end: "2026-11-16T10:00" })
    ])
    Vitest.expect(times.get("task")).toEqual({ spent: 60, next: "2026-11-19T13:00" })
  })

  Vitest.test("keeps each task apart", () => {
    const times = Time.timeOf([block({ task: "a" }), block({ task: "b", state: "planned" })])
    Vitest.expect([times.get("a"), times.get("b")]).toEqual([
      { spent: 60, next: null },
      { spent: 0, next: "2026-11-17T09:00" }
    ])
  })
})
