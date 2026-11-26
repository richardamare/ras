import * as ReactI18next from "react-i18next"

import type * as Period from "@/features/insights/lib/period"
import type * as Api from "@/lib/api/generated/types.gen"
import * as Prague from "@/lib/prague"

export type Insights = Api.InsightsEncoded
export type ShownEvent = Insights["unanswered"][number]

/** The period, part and event labels of the insights page, in the reader's language. */
export const useLabels = () => {
  const { t, i18n } = ReactI18next.useTranslation("Insights")
  const day = (date: string, options: Intl.DateTimeFormatOptions) => Prague.dayLabel(date, i18n.language, options)
  const range = (first: string, last: string) =>
    first === last
      ? day(first, { weekday: "short", day: "numeric", month: "numeric" })
      : `${day(first, { day: "numeric", month: "numeric" })} – ${day(last, { day: "numeric", month: "numeric" })}`
  return {
    period: (kind: Period.Kind, first: string, last: string) => {
      if (kind === "week")
        return `${day(first, { day: "numeric", month: "short" })} – ${day(last, { day: "numeric", month: "short", year: "numeric" })}`
      if (kind === "month") return day(first, { month: "long", year: "numeric" })
      return t("quarterLabel", { quarter: (Number(first.slice(5, 7)) + 2) / 3, year: first.slice(0, 4) })
    },
    part: (kind: Period.Kind, part: Insights["parts"][number]) =>
      kind === "quarter" ? day(part.first, { month: "long" }) : range(part.first, part.last),
    when: (event: ShownEvent) =>
      `${day(event.start.slice(0, 10), { weekday: "short", day: "numeric", month: "numeric" })} ${event.start.slice(11, 16)}–${event.end.slice(11, 16)}`
  }
}
