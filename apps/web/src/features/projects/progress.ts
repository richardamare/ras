import type * as Api from "@/lib/api/generated/types.gen"

export interface Progress {
  readonly done: number
  readonly total: number
}

/** How many of each project's tasks are done. */
export const progressOf = (tasks: ReadonlyArray<Api.TaskSummaryEncoded>) => {
  const progress = new Map<string, Progress>()
  for (const task of tasks) {
    if (task.project === null) continue
    const { done, total } = progress.get(task.project) ?? { done: 0, total: 0 }
    progress.set(task.project, { done: done + (task.status === "done" ? 1 : 0), total: total + 1 })
  }
  return progress
}

/** The blocks still to come of the tasks named, earliest first. */
export const upcoming = (blocks: ReadonlyArray<Api.BlockEncoded>, tasks: ReadonlySet<string>) =>
  blocks
    .filter((block) => tasks.has(block.task) && block.state !== "done")
    .toSorted((a, b) => a.start.localeCompare(b.start))
