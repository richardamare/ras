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

const shift = (local: string, minutes: number) =>
  new Date(Date.parse(`${local}:00Z`) + minutes * 60_000).toISOString().slice(0, 16)

/** The block the add dialog offers: an hour from the quarter hour `now` falls in, kept within its day. */
export const blockDefaults = (now: string) => {
  const start = shift(now, -(Number(now.slice(14, 16)) % 15))
  const end = shift(start, 60)
  return {
    date: start.slice(0, 10),
    from: start.slice(11),
    to: end.slice(0, 10) === start.slice(0, 10) ? end.slice(11) : "23:59"
  }
}
