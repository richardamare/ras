import * as Nuqs from "nuqs"

import * as CalendarUrl from "@/features/calendar/lib/url"
import * as Period from "@/features/insights/lib/period"

/** The period and a day in it, which the route validates. */
export const periodParams = {
  period: Nuqs.parseAsStringLiteral(Period.kinds).withDefault("week"),
  date: CalendarUrl.day
}

/** The period, a day in it and the ticked calendars, `?calendar=101,201`. */
export const params = {
  ...periodParams,
  calendar: Nuqs.parseAsArrayOf(Nuqs.parseAsInteger)
}
