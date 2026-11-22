import * as Prague from "@/lib/prague"

export const kinds = ["week", "month", "quarter"] as const
export type Kind = (typeof kinds)[number]

const monthFirst = (day: string, by: number) => {
  const date = new Date(`${day.slice(0, 7)}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + by)
  return date.toISOString().slice(0, 10)
}

export const first = (kind: Kind, day: string) => {
  if (kind === "week") return Prague.addDays(day, -Prague.weekday(day))
  if (kind === "month") return monthFirst(day, 0)
  return monthFirst(day, -((Number(day.slice(5, 7)) - 1) % 3))
}

/** For a month or a quarter, the period's first day. */
export const step = (kind: Kind, day: string, by: number) => {
  if (kind === "week") return Prague.addDays(day, 7 * by)
  return monthFirst(first(kind, day), kind === "month" ? by : 3 * by)
}

export const contains = (kind: Kind, day: string, other: string) => first(kind, day) === first(kind, other)
