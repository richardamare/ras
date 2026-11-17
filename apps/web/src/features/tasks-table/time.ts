import type * as Api from "@/lib/api/generated/types.gen"
import * as Prague from "@/lib/prague"

export interface TaskTime {
  readonly spent: number
  /** The start of its earliest block still to come. */
  readonly next: string | null
}

/** Every block a task has ever had or has planned, as the Tasks table reads them. */
export const span = { from: "2000-01-01T00:00", to: "2100-01-01T00:00" }

export const timeOf = (blocks: ReadonlyArray<Api.BlockEncoded>) => {
  const times = new Map<string, TaskTime>()
  for (const block of blocks) {
    const time = times.get(block.task) ?? { spent: 0, next: null }
    times.set(block.task, {
      spent:
        time.spent + (block.state === "done" && block.end !== null ? Prague.minutesBetween(block.start, block.end) : 0),
      next:
        (block.state === "planned" || block.state === "draft") && (time.next === null || block.start < time.next)
          ? block.start
          : time.next
    })
  }
  return times
}
