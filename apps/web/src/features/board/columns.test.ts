import * as Vitest from "vitest"

import type * as Api from "@/lib/api/generated/types.gen"
import * as Columns from "@/features/board/columns"

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

Vitest.describe("the board's columns", () => {
  Vitest.test("hold every status in order, an empty one too", () => {
    Vitest.expect(Columns.columns([]).map((column) => column.status)).toEqual([
      "inbox",
      "todo",
      "in_progress",
      "blocked",
      "review",
      "done"
    ])
  })

  Vitest.test("put the most urgent task first, then the nearest deadline, an undated one last", () => {
    const [, todo] = Columns.columns([
      task({ title: "undated" }),
      task({ title: "friday", deadline: "2026-11-20" }),
      task({ title: "urgent", priority: "urgent" }),
      task({ title: "monday", deadline: "2026-11-16" }),
      task({ title: "elsewhere", status: "review" })
    ])
    Vitest.expect(todo!.tasks.map((one) => one.title)).toEqual(["urgent", "monday", "friday", "undated"])
  })
})
