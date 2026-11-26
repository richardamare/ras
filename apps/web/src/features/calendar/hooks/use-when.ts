import * as ReactI18next from "react-i18next"

import * as Prague from "@/lib/prague"

/** A day and a span of an event in words, in the reader's language. */
export function useWhen() {
  const { i18n } = ReactI18next.useTranslation()
  const day = (local: string) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
      new Date(`${local.slice(0, 10)}T12:00:00Z`)
    )
  return {
    day,
    span: (start: string, end: string) => `${day(start)}, ${start.slice(11)}–${end.slice(11)}`,
    /** All-day days: the end is the midnight after the last one, and a single day is named once. */
    days: (start: string, end: string) => {
      const last = Prague.addDays(end.slice(0, 10), -1)
      return last === start.slice(0, 10) ? day(start) : `${day(start)} – ${day(last)}`
    }
  }
}
