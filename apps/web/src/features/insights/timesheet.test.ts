import * as Vitest from "vitest"

import type * as Api from "@/lib/api/generated/types.gen"
import * as Timesheet from "@/features/insights/timesheet"

const block = (id: string, task: string): Api.BlockEncoded => ({
  id,
  task,
  title: "",
  calendar: 1,
  start: "2026-11-16T09:00",
  end: "2026-11-16T10:00",
  state: "done"
})

const task = (id: string, title: string, project: string | null): Api.TaskSummaryEncoded => ({
  id,
  title,
  status: "in_progress",
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

const project = (id: string, name: string): Api.ProjectEncoded => ({
  id,
  space: "space",
  name,
  status: "active",
  deadline: null,
  description: null
})

Vitest.describe("the timesheet of work blocks", () => {
  Vitest.it("groups the blocks' time by project, then by task, the largest first", () => {
    const lines = Timesheet.timesheet(
      [
        { block: "b1", minutes: 60 },
        { block: "b2", minutes: 30 },
        { block: "b3", minutes: 45 },
        { block: "b4", minutes: 120 }
      ],
      {
        blocks: [block("b1", "t1"), block("b2", "t1"), block("b3", "t2"), block("b4", "t3")],
        tasks: [task("t1", "Design", "p1"), task("t2", "Review", "p1"), task("t3", "Errands", null)],
        projects: [project("p1", "Website")]
      }
    )
    Vitest.expect(lines).toEqual([
      {
        project: "Website",
        minutes: 135,
        tasks: [
          { task: "Design", minutes: 90 },
          { task: "Review", minutes: 45 }
        ]
      },
      { project: null, minutes: 120, tasks: [{ task: "Errands", minutes: 120 }] }
    ])
  })

  Vitest.it("keeps the time of a block the work API no longer knows, under no project and no task", () => {
    Vitest.expect(
      Timesheet.timesheet([{ block: "gone", minutes: 15 }], { blocks: [], tasks: [], projects: [] })
    ).toEqual([{ project: null, minutes: 15, tasks: [{ task: null, minutes: 15 }] }])
  })
})
