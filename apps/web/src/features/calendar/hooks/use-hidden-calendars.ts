import * as React from "react"
import * as HiddenCalendars from "@/features/calendar/lib/hidden-calendars"

/** The calendars switched off on the calendar screen, remembered in this browser; a hidden calendar still takes writes. */
export const useHiddenCalendars = () => {
  const [hidden, setHidden] = React.useState(HiddenCalendars.read)
  const toggle = (calendar: number) => {
    const next = HiddenCalendars.toggled(hidden, calendar)
    localStorage.setItem(HiddenCalendars.key, JSON.stringify([...next]))
    setHidden(next)
  }
  return { hidden, toggle }
}
