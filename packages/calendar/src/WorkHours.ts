import * as Arr from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Time from "@ras/kernel/Time"
import * as Busy from "./Busy.ts"
import * as Domain from "./Domain.ts"

export const uncategorised = "No category"

/** The instants a Prague month runs between. */
export const spanOfMonth = (month: Domain.Month): Domain.Span => {
  const [year, number] = month.split("-").map(Number) as [number, number]
  const next = number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, "0")}`
  return {
    start: Time.pragueMidnight(Time.PragueDate.make(`${month}-01`)),
    end: Time.pragueMidnight(Time.PragueDate.make(`${next}-01`))
  }
}

const minutes = (spans: ReadonlyArray<Domain.Span>, window: Domain.Span) =>
  Math.round(
    Arr.reduce(
      Busy.merge(spans, window),
      0,
      (total, span) => total + DateTime.toEpochMillis(span.end) - DateTime.toEpochMillis(span.start)
    ) / 60_000
  )

/** The span cut at each Prague midnight it crosses, so a stretch past midnight counts on each day it touches. */
const byDay = (span: Domain.Span): ReadonlyArray<{ readonly date: Time.PragueDate; readonly span: Domain.Span }> => {
  const date = Time.pragueDateOf(span.start)
  const midnight = Time.pragueMidnight(Time.addDays(date, 1))
  return DateTime.isLessThan(midnight, span.end)
    ? [{ date, span: { start: span.start, end: midnight } }, ...byDay({ start: midnight, end: span.end })]
    : [{ date, span }]
}

const timeBy = (
  pieces: ReadonlyArray<{ readonly category: string; readonly span: Domain.Span }>,
  window: Domain.Span
): ReadonlyArray<Domain.CategoryTime> =>
  Object.entries(Arr.groupBy(pieces, (piece) => piece.category))
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(
      ([category, group]) =>
        new Domain.CategoryTime({
          category,
          minutes: minutes(
            group.map((piece) => piece.span),
            window
          )
        })
    )

/**
 * The time a month's timed, blocking events take, in total, by category and per Prague day. Overlapping events count
 * their shared time once. With `categories` only those count, matched without regard to case.
 */
export const report = (
  entries: ReadonlyArray<Domain.Entry>,
  month: Domain.Month,
  categories: ReadonlyArray<string>
): Domain.WorkHours => {
  const window = spanOfMonth(month)
  const wanted = categories.map((category) => category.toLowerCase())
  const counted = Arr.getSomes(
    Arr.map(
      Arr.filter(entries, (entry) => Domain.blocks(entry) && !entry.allDay),
      (entry) => {
        const category = Option.getOrElse(entry.category, () => uncategorised)
        return wanted.length > 0 && !wanted.includes(category.toLowerCase())
          ? Option.none()
          : Option.map(Busy.clip(entry.span, window), (span) => ({ category, span }))
      }
    )
  )
  const pieces = Arr.flatMap(counted, (item) =>
    byDay(item.span).map((piece) => ({ ...piece, category: item.category }))
  )
  return new Domain.WorkHours({
    month,
    minutes: minutes(
      counted.map((item) => item.span),
      window
    ),
    categories: timeBy(counted, window).map((time) => ({
      category: time.category,
      minutes: time.minutes,
      events: counted.filter((item) => item.category === time.category).length
    })),
    days: Object.entries(Arr.groupBy(pieces, (piece) => piece.date))
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(
        ([date, group]) =>
          new Domain.WorkDay({
            date: Time.PragueDate.make(date),
            minutes: minutes(
              group.map((piece) => piece.span),
              window
            ),
            categories: timeBy(group, window)
          })
      )
  })
}
