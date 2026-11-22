import type * as Api from "@/lib/api/generated/types.gen"

export type TaskLine = { readonly task: string | null; readonly minutes: number }
export type ProjectLine = {
  readonly project: string | null
  readonly minutes: number
  readonly tasks: ReadonlyArray<TaskLine>
}

type Work = {
  readonly blocks: ReadonlyArray<Api.BlockEncoded>
  readonly tasks: ReadonlyArray<Api.TaskSummaryEncoded>
  readonly projects: ReadonlyArray<Api.ProjectEncoded>
}

const byMinutes = <A extends { readonly minutes: number }>(lines: ReadonlyArray<A>) =>
  lines.toSorted((a, b) => b.minutes - a.minutes)

/** The work blocks' time by project, then by task, one line per task the owner fills a timesheet with. */
export const timesheet = (
  blockTimes: ReadonlyArray<Api.InsightsEncoded["workBlocks"]["blocks"][number]>,
  work: Work
): ReadonlyArray<ProjectLine> => {
  const taskOf = new Map(work.blocks.map((block) => [block.id, block.task]))
  const tasks = new Map(work.tasks.map((task) => [task.id, task]))
  const projectNames = new Map(work.projects.map((project) => [project.id, project.name]))

  const projects = new Map<string | null, Map<string | null, TaskLine>>()
  for (const { block, minutes } of blockTimes) {
    const task = tasks.get(taskOf.get(block) ?? "")
    const project = task?.project ?? null
    const lines = projects.get(project) ?? new Map<string | null, TaskLine>()
    const line = lines.get(task?.id ?? null)
    lines.set(task?.id ?? null, { task: task?.title ?? null, minutes: (line?.minutes ?? 0) + minutes })
    projects.set(project, lines)
  }

  return byMinutes(
    [...projects].map(([project, lines]) => ({
      project: project === null ? null : (projectNames.get(project) ?? null),
      minutes: [...lines.values()].reduce((total, line) => total + line.minutes, 0),
      tasks: byMinutes([...lines.values()])
    }))
  )
}
