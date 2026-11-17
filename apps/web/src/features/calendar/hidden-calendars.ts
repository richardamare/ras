import * as React from "react"
import * as Zod from "zod"

const key = "ras-calendar-hidden"
const Stored = Zod.array(Zod.number().int())

const read = (): ReadonlySet<number> => {
  try {
    const stored = Stored.safeParse(JSON.parse(localStorage.getItem(key) ?? "[]"))
    return new Set(stored.success ? stored.data : [])
  } catch {
    return new Set()
  }
}

/** Adds the calendar to the hidden ones or takes it out. */
export const toggled = (hidden: ReadonlySet<number>, calendar: number): ReadonlySet<number> => {
  const next = new Set(hidden)
  if (!next.delete(calendar)) next.add(calendar)
  return next
}

/** The calendars switched off on the calendar screen, remembered in this browser; a hidden calendar still takes writes. */
export const useHiddenCalendars = () => {
  const [hidden, setHidden] = React.useState(read)
  const toggle = (calendar: number) => {
    const next = toggled(hidden, calendar)
    localStorage.setItem(key, JSON.stringify([...next]))
    setHidden(next)
  }
  return { hidden, toggle }
}
