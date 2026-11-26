import * as ReactI18next from "react-i18next"
import * as Prague from "@/lib/prague"

/** A day as people say it: today, tomorrow, yesterday, else the weekday and date; the year only when it differs. */
export const useDayLabel = () => {
  const { t, i18n } = ReactI18next.useTranslation("Work")
  const today = Prague.today()
  return (day: string) => {
    if (day === today) return t("day.today")
    if (day === Prague.addDays(today, 1)) return t("day.tomorrow")
    if (day === Prague.addDays(today, -1)) return t("day.yesterday")
    return new Intl.DateTimeFormat(i18n.language, {
      weekday: "short",
      day: "numeric",
      month: "numeric",
      ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
      timeZone: "UTC"
    }).format(new Date(`${day}T12:00:00Z`))
  }
}
