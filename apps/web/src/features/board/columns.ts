import type * as Api from "@/lib/api/generated/types.gen"
import * as Work from "@/features/tasks/work"

type Task = Api.TaskSummaryEncoded

const rank = (task: Task) => Work.priorities.indexOf(task.priority)

/** The board's columns in status order, each most urgent first, then by deadline, undated last. */
export const columns = (tasks: ReadonlyArray<Task>) =>
  Work.statuses.map((status) => ({
    status,
    tasks: tasks
      .filter((task) => task.status === status)
      .toSorted(
        (a, b) =>
          rank(a) - rank(b) ||
          (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
          a.title.localeCompare(b.title)
      )
  }))
