import type * as Api from "@/lib/api/generated/types.gen"
import * as Prague from "@/lib/prague"

type Task = Api.TaskSummaryEncoded

export type Summary = {
  /** The owner's tasks not done. */
  open: number
  /** The owner's tasks not done whose deadline has passed. */
  overdue: number
  inReview: number
  /** Tasks not done, by the day their deadline falls on. */
  deadlines: { today: Task[]; tomorrow: Task[]; thisWeek: Task[] }
  /** What waits on the owner: tasks in review or blocked, whoever holds them. */
  waiting: Task[]
}

const byDeadline = (a: Task, b: Task) => (a.deadline ?? "").localeCompare(b.deadline ?? "")

export const summary = (tasks: ReadonlyArray<Task>, today: string): Summary => {
  const notDone = tasks.filter((task) => task.status !== "done")
  const owners = notDone.filter((task) => task.assignee === "owner")
  const tomorrow = Prague.addDays(today, 1)
  const sunday = Prague.addDays(today, 6 - Prague.weekday(today))
  const due = (test: (deadline: string) => boolean) =>
    notDone.filter((task) => task.deadline !== null && test(task.deadline)).toSorted(byDeadline)
  return {
    open: owners.length,
    overdue: owners.filter((task) => task.deadline !== null && task.deadline < today).length,
    inReview: notDone.filter((task) => task.status === "review").length,
    deadlines: {
      today: due((deadline) => deadline === today),
      tomorrow: due((deadline) => deadline === tomorrow),
      thisWeek: due((deadline) => deadline > tomorrow && deadline <= sunday)
    },
    waiting: notDone
      .filter((task) => task.status === "review" || task.status === "blocked")
      .toSorted((a, b) => a.updated.localeCompare(b.updated))
  }
}
