import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Errors from "@ras/kernel/Errors"
import * as Time from "@ras/kernel/Time"
import * as Recurrence from "../model/Recurrence.ts"
import type * as Writer from "../model/Writer.ts"
import * as Reclaim from "../reclaim/Reclaim.ts"
import type * as Calendar from "../model/Calendar.ts"
import * as Outlook from "./Outlook.ts"

const clock = (local: string): Outlook.Clock => ({ dateTime: `${local}:00`, timeZone: Outlook.timeZone })

const schedule = (when: Writer.When): Outlook.Write =>
  when._tag === "Timed"
    ? { start: clock(when.start), end: clock(when.end), isAllDay: false }
    : { start: clock(`${when.first}T00:00`), end: clock(`${Time.addDays(when.last, 1)}T00:00`), isAllDay: true }

/** Graph's patterned recurrence for a repeat, its clock kept in Prague. */
export const recurrenceOf = (recurrence: Recurrence.Recurrence): Outlook.Recurrence => {
  const { start, interval, position } = recurrence
  const [, month, day] = start.split("-").map(Number) as [number, number, number]
  const daysOfWeek = [Recurrence.weekdayOf(start)]
  const pattern: Outlook.Recurrence["pattern"] =
    recurrence.every === "day"
      ? { type: "daily", interval }
      : recurrence.every === "week"
        ? { type: "weekly", interval, daysOfWeek: recurrence.weekdays, firstDayOfWeek: "monday" }
        : position !== null
          ? recurrence.every === "month"
            ? { type: "relativeMonthly", interval, daysOfWeek, index: position }
            : { type: "relativeYearly", interval, daysOfWeek, index: position, month }
          : recurrence.every === "month"
            ? { type: "absoluteMonthly", interval, dayOfMonth: day }
            : { type: "absoluteYearly", interval, dayOfMonth: day, month }
  const { end } = recurrence
  const range: Outlook.Recurrence["range"] =
    end._tag === "Until"
      ? { type: "endDate", startDate: start, endDate: end.day, recurrenceTimeZone: Outlook.timeZone }
      : end._tag === "Count"
        ? { type: "numbered", startDate: start, numberOfOccurrences: end.count, recurrenceTimeZone: Outlook.timeZone }
        : { type: "noEnd", startDate: start, recurrenceTimeZone: Outlook.timeZone }
  return { pattern, range }
}

/** The Graph body of a write, each field only when it is given. */
export const writeOf = (write: Writer.Write): Outlook.Write => ({
  ...(write.title === undefined ? {} : { subject: write.title }),
  ...(write.notes === undefined ? {} : { body: { contentType: "text", content: write.notes } }),
  ...(write.location === undefined ? {} : { location: { displayName: write.location } }),
  ...(write.showAs === undefined ? {} : { showAs: write.showAs }),
  ...(write.when === undefined ? {} : schedule(write.when))
})

const unreachable = (calendar: Calendar.SourceCalendar) =>
  new Errors.SourceFailed({ source: "graph", reason: `"${calendar.name}" has no Outlook id in Reclaim.` })

/** Writes through Graph; an event read from Reclaim is found by the id Outlook gives it, its occurrence's in a series. */
export const make = Effect.gen(function* () {
  const outlook = yield* Outlook.Outlook
  const reclaim = yield* Reclaim.Reclaim

  const eventOf = (calendar: Calendar.SourceCalendar, target: Writer.Target) =>
    target._tag === "Placed"
      ? Effect.succeed(target.id)
      : Effect.flatMap(reclaim.providerId(calendar, target.entry.ref.id), (series) =>
          target.entry.recurring
            ? outlook.occurrence(series, Time.toPragueLocal(target.entry.span.start))
            : Effect.succeed(series)
        )

  return {
    create: (calendar, event) =>
      Option.match(calendar.providerId, {
        onNone: () => Effect.fail(unreachable(calendar)),
        onSome: (id) =>
          outlook.create(id, {
            ...writeOf(event),
            ...(event.recurrence === undefined ? {} : { recurrence: recurrenceOf(event.recurrence) }),
            transactionId: event.key
          })
      }),
    change: (calendar, target, write) =>
      Effect.flatMap(eventOf(calendar, target), (id) => outlook.change(id, writeOf(write))),
    cancel: (calendar, target) => Effect.flatMap(eventOf(calendar, target), outlook.cancel)
  } satisfies Writer.Writer
})
