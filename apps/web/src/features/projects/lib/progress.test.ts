import * as Vitest from "vitest"

import type * as Api from "@/lib/api/generated/types.gen"
import * as Progress from "@/features/projects/lib/progress"

const task = (project: string | null, status: Api.TaskSummaryEncoded["status"]): Api.TaskSummaryEncoded => ({
  id: `${project}-${status}`,
  title: "task",
  status,
  assignee: "owner",
  priority: "normal",
  deadline: null,
  estimate: null,
  project,
  space: "space",
  created: "2026-11-01T09:00",
  updated: "2026-11-01T09:00",
  closed: null
})

const block = (owner: string, start: string, state: Api.BlockEncoded["state"]): Api.BlockEncoded => ({
  id: `${owner}-${start}`,
  task: owner,
  title: "ras: task",
  calendar: 1,
  start,
  end: null,
  state
})

Vitest.describe("a project's progress", () => {
  Vitest.test("counts its done tasks out of all of them and leaves out tasks without a project", () => {
    const progress = Progress.progressOf([
      task("a", "done"),
      task("a", "todo"),
      task("a", "review"),
      task(null, "done")
    ])
    Vitest.expect([...progress]).toEqual([["a", { done: 1, total: 3 }]])
  })

  Vitest.test("lists the project's blocks still to come, earliest first", () => {
    const blocks = [
      block("t1", "2026-11-20T09:00", "planned"),
      block("t2", "2026-11-18T09:00", "draft"),
      block("t1", "2026-11-16T09:00", "done"),
      block("other", "2026-11-17T09:00", "planned")
    ]
    Vitest.expect(Progress.upcoming(blocks, new Set(["t1", "t2"])).map((one) => one.start)).toEqual([
      "2026-11-18T09:00",
      "2026-11-20T09:00"
    ])
  })
})
