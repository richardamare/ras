import * as Nuqs from "nuqs"

import * as Period from "@/features/insights/period"

const day = Nuqs.createParser({
  parse: (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null),
  serialize: (value: string) => value
})

/** The period and a day in it, which the route validates. */
export const periodParams = {
  period: Nuqs.parseAsStringLiteral(Period.kinds).withDefault("week"),
  date: day
}

/** The period, a day in it and the ticked calendars, `?calendar=101,201`. */
export const params = {
  ...periodParams,
  calendar: Nuqs.parseAsArrayOf(Nuqs.parseAsInteger)
}
