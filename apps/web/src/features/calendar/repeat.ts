import type * as I18next from "i18next"

import type * as Api from "@/lib/api/generated/types.gen"

export type Repeat = NonNullable<Api.CalendarCreateEventData["body"]["repeat"]>
export type Every = Repeat["every"]
export type Weekday = NonNullable<Repeat["on"]>[number]
export type By = NonNullable<Repeat["by"]>

export const everyChoices = ["day", "week", "month", "year"] as const satisfies ReadonlyArray<Every>

export const weekdays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
] as const satisfies ReadonlyArray<Weekday>

const workdays: ReadonlyArray<Weekday> = ["monday", "tuesday", "wednesday", "thursday", "friday"]

export const ends = ["never", "until", "count"] as const

/** The quick choices Outlook offers for a start day, and `custom` for any other repeat. */
export const presets = ["never", "daily", "workdays", "weekly", "monthly", "yearly", "custom"] as const
export type Preset = (typeof presets)[number]

export interface RepeatForm {
  readonly every: Every | "never"
  readonly interval: number
  readonly on: ReadonlyArray<Weekday>
  readonly by: By
  readonly end: (typeof ends)[number]
  readonly until: string
  readonly count: number
}

const parts = (day: string) => {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number]
  return { year, month, date }
}

type MonthKey = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "11" | "12"
const monthOf = (day: string) => String(parts(day).month) as MonthKey

/** The weekday of a Prague day, `2026-11-17`; computed in UTC, so no local zone moves the day. */
export const weekdayOf = (day: string): Weekday => weekdays[(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7]!

/** Which of the month's days of its weekday the day is, from 1; 5 when it falls in the month's final week. */
export const placeOf = (day: string): 1 | 2 | 3 | 4 | 5 => {
  const { year, month, date } = parts(day)
  const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return date + 7 > lastDate ? 5 : ((Math.floor((date - 1) / 7) + 1) as 1 | 2 | 3 | 4)
}

/** No repeat yet; a weekly repeat starts on the event's weekday and an end date on its day. */
export const initial = (day: string): RepeatForm => ({
  every: "never",
  interval: 1,
  on: [weekdayOf(day)],
  by: "date",
  end: "never",
  until: day,
  count: 10
})

/** Adds the day or removes it, keeping the week's order. */
export const toggle = (on: ReadonlyArray<Weekday>, day: Weekday): ReadonlyArray<Weekday> =>
  weekdays.filter((candidate) => (candidate === day ? !on.includes(candidate) : on.includes(candidate)))

/** The form a quick choice stands for; `custom` keeps the form, turning a repeat on when there is none. */
export const applyPreset = (form: RepeatForm, preset: Preset, day: string): RepeatForm => {
  const plain = { ...form, interval: 1, by: "date" as const, on: [weekdayOf(day)] }
  switch (preset) {
    case "never":
      return { ...form, every: "never" }
    case "daily":
      return { ...plain, every: "day" }
    case "workdays":
      return { ...plain, every: "week", on: workdays }
    case "weekly":
      return { ...plain, every: "week" }
    case "monthly":
      return { ...plain, every: "month" }
    case "yearly":
      return { ...plain, every: "year" }
    case "custom":
      return form.every === "never" ? { ...form, every: "week" } : form
  }
}

const sameDays = (a: ReadonlyArray<Weekday>, b: ReadonlyArray<Weekday>) =>
  a.length === b.length && a.every((day) => b.includes(day))

/** The quick choice the form matches, its end aside; `custom` when none does. */
export const presetOf = (form: RepeatForm, day: string): Preset => {
  if (form.every === "never") return "never"
  if (form.interval !== 1) return "custom"
  if (form.every === "day") return "daily"
  if (form.every === "week") {
    if (sameDays(form.on, workdays)) return "workdays"
    return sameDays(form.on, [weekdayOf(day)]) ? "weekly" : "custom"
  }
  if (form.by !== "date") return "custom"
  return form.every === "month" ? "monthly" : "yearly"
}

/** The repeat the API takes, or none for an event that happens once. */
export const repeatOf = (form: RepeatForm): Repeat | undefined => {
  if (form.every === "never") return undefined
  return {
    every: form.every,
    ...(form.interval > 1 && { interval: form.interval }),
    ...(form.every === "week" && form.on.length > 0 && { on: form.on as unknown as NonNullable<Repeat["on"]> }),
    ...((form.every === "month" || form.every === "year") && form.by === "weekday" && { by: "weekday" as const }),
    ...(form.end === "until" && { until: form.until }),
    ...(form.end === "count" && { count: form.count })
  }
}

type T = I18next.TFunction<"Calendar">

const listOf = (t: T, items: ReadonlyArray<string>) =>
  items.length <= 1
    ? items.join("")
    : `${items.slice(0, -1).join(", ")}${t("repeat.summary.and")}${items[items.length - 1]}`

/** "17." or "3. úterý": where in the month a monthly repeat falls. */
export const monthlyLabel = (t: T, day: string, by: By) =>
  by === "date"
    ? t("repeat.monthly.date", { date: parts(day).date })
    : t("repeat.monthly.weekday", {
        place: t(`repeat.place.${placeOf(day)}`),
        weekday: t(`repeat.day.${weekdayOf(day)}`)
      })

/** "17. listopadu" or "3. úterý v listopadu": where in the year a yearly repeat falls. */
export const yearlyLabel = (t: T, day: string, by: By) =>
  by === "date"
    ? t("repeat.yearly.date", { date: parts(day).date, month: t(`repeat.monthOf.${monthOf(day)}`) })
    : t("repeat.yearly.weekday", {
        place: t(`repeat.place.${placeOf(day)}`),
        weekday: t(`repeat.day.${weekdayOf(day)}`),
        month: t(`repeat.monthIn.${monthOf(day)}`)
      })

const dateLabel = (day: string, language: string) =>
  new Intl.DateTimeFormat(language === "cs" ? "cs-CZ" : "en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`)
  )

/** One line for the repeat, as Outlook writes it: "Každé 2 týdny v po a čt, do 31. 12. 2026". */
export const summaryOf = (t: T, language: string, form: RepeatForm, day: string): string => {
  if (form.every === "never") return t("repeat.summary.never")
  const every = t("repeat.summary.every", {
    count: form.interval,
    unit: t(`repeat.unit.${form.every}`, { count: form.interval })
  })
  const where =
    form.every === "week"
      ? t("repeat.summary.on", {
          days: listOf(
            t,
            form.on.map((one) => t(`repeat.short.${one}`))
          )
        })
      : form.every === "month"
        ? monthlyLabel(t, day, form.by)
        : form.every === "year"
          ? yearlyLabel(t, day, form.by)
          : null
  const end =
    form.end === "until"
      ? t("repeat.summary.until", { date: dateLabel(form.until, language) })
      : form.end === "count"
        ? t("repeat.summary.count", { count: form.count })
        : null
  return [where === null ? every : `${every} ${where}`, end].filter((part) => part !== null).join(", ")
}
