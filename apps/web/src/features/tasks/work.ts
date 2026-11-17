import type * as Api from "@/lib/api/generated/types.gen"

export type Status = Api.TaskSummaryEncoded["status"]

export const statuses: ReadonlyArray<Status> = ["inbox", "todo", "in_progress", "blocked", "review", "done"]

/** A move into one of these takes a comment in the same call: what is needed, or what to check. */
export const explained: ReadonlyArray<Status> = ["blocked", "review"]

export const priorities: ReadonlyArray<Api.TaskSummaryEncoded["priority"]> = ["urgent", "high", "normal", "low"]

/** The reason a refusal carries, for a toast. */
export const reasonOf = (error: unknown) =>
  typeof error === "object" && error !== null
    ? "reason" in error && typeof error.reason === "string"
      ? "instead" in error && typeof error.instead === "string"
        ? `${error.reason} ${error.instead}`
        : error.reason
      : undefined
    : undefined

/** An estimate typed as `1:30` or as plain minutes, in minutes; `null` for an empty box, `undefined` for neither. */
export const minutesOf = (text: string): number | null | undefined => {
  const typed = text.trim()
  if (typed === "") return null
  const clock = /^(\d+):([0-5]\d)$/.exec(typed)
  if (clock !== null) return Number(clock[1]) * 60 + Number(clock[2])
  return /^\d+$/.test(typed) ? Number(typed) : undefined
}
