import * as Zod from "zod"

export const key = "ras-calendar-hidden"
const Stored = Zod.array(Zod.number().int())

/** The calendar ids this browser keeps under `key`, none when it keeps nothing readable. */
export const storedCalendars = (key: string): ReadonlyArray<number> => {
  try {
    const stored = Stored.safeParse(JSON.parse(localStorage.getItem(key) ?? "[]"))
    return stored.success ? stored.data : []
  } catch {
    return []
  }
}

export const read = (): ReadonlySet<number> => new Set(storedCalendars(key))

/** Adds the calendar to the hidden ones or takes it out. */
export const toggled = (hidden: ReadonlySet<number>, calendar: number): ReadonlySet<number> => {
  const next = new Set(hidden)
  if (!next.delete(calendar)) next.add(calendar)
  return next
}
