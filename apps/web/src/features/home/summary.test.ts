import * as Vitest from "vitest"

import type * as Api from "@/lib/api/generated/types.gen"
import * as Summary from "@/features/home/summary"

const task = (overrides: Partial<Api.TaskSummaryEncoded>): Api.TaskSummaryEncoded => ({
  id: overrides.title ?? "task",
  title: "task",
  status: "todo",
  assignee: "owner",
  priority: "normal",
  deadline: null,
  estimate: null,
  project: null,
  space: "space",
  created: "2026-11-01T09:00",
  updated: "2026-11-01T09:00",
  closed: null,
  ...overrides
})

// Tuesday 17 November 2026; that week's Sunday is the 22nd.
const today = "2026-11-17"

Vitest.describe("the home summary", () => {
  Vitest.test("counts the owner's open and overdue tasks, and every task in review", () => {
    const result = Summary.summary(
      [
        task({ title: "late", deadline: "2026-11-16" }),
        task({ title: "fine" }),
        task({ title: "closed", status: "done", deadline: "2026-11-01" }),
        task({ title: "agent", assignee: "scheduler", status: "review" })
      ],
      today
    )
    Vitest.expect([result.open, result.overdue, result.inReview]).toEqual([2, 1, 1])
  })

  Vitest.test("puts deadlines under today, tomorrow and the rest of this week, and leaves out next week's", () => {
    const { deadlines } = Summary.summary(
      [
        task({ title: "sunday", deadline: "2026-11-22" }),
        task({ title: "today", deadline: "2026-11-17" }),
        task({ title: "thursday", deadline: "2026-11-19" }),
        task({ title: "tomorrow", deadline: "2026-11-18" }),
        task({ title: "next monday", deadline: "2026-11-23" })
      ],
      today
    )
    Vitest.expect(
      [deadlines.today, deadlines.tomorrow, deadlines.thisWeek].map((list) => list.map((one) => one.title))
    ).toEqual([["today"], ["tomorrow"], ["thursday", "sunday"]])
  })

  Vitest.test("lists what waits on the owner, the longest waiting first", () => {
    const { waiting } = Summary.summary(
      [
        task({ title: "review", status: "review", updated: "2026-11-16T10:00" }),
        task({ title: "blocked", status: "blocked", assignee: "scheduler", updated: "2026-11-15T10:00" }),
        task({ title: "todo" })
      ],
      today
    )
    Vitest.expect(waiting.map((one) => one.title)).toEqual(["blocked", "review"])
  })
})
