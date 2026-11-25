import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Errors from "@ras/kernel/Errors"
import * as Time from "@ras/kernel/Time"
import * as Recurrence from "../events/Recurrence.ts"
import type * as Writer from "../events/Writer.ts"
import type * as Reclaim from "../reclaim/Reclaim.ts"
import * as GoogleCalendar from "./GoogleCalendar.ts"

const timeZone = "Europe/Prague"

const days: Record<string, string> = {
  sunday: "SU",
  monday: "MO",
  tuesday: "TU",
  wednesday: "WE",
  thursday: "TH",
  friday: "FR",
  saturday: "SA"
}

const ordinals: Record<Recurrence.Position, number> = { first: 1, second: 2, third: 3, fourth: 4, last: -1 }

const compact = (instant: DateTime.Utc) => DateTime.formatIso(instant).replace(/[-:]|\.\d{3}/g, "")

/**
 * The RRULE of a repeat. Its end is the last moment of its last day in Prague, as a UTC time for a timed event and a
 * date for an all-day one, which is how RFC 5545 has it match the event's start.
 */
export const ruleOf = (recurrence: Recurrence.Recurrence, allDay: boolean): string => {
  const weekday = days[Recurrence.weekdayOf(recurrence.start)]!
  const parts = [
    `FREQ=${({ day: "DAILY", week: "WEEKLY", month: "MONTHLY", year: "YEARLY" } as const)[recurrence.every]}`
  ]
  if (recurrence.interval > 1) parts.push(`INTERVAL=${recurrence.interval}`)
  if (recurrence.every === "week") parts.push(`BYDAY=${recurrence.weekdays.map((name) => days[name]).join(",")}`)
  if (recurrence.position !== null) {
    if (recurrence.every === "year") parts.push(`BYMONTH=${Number(recurrence.start.slice(5, 7))}`)
    parts.push(`BYDAY=${ordinals[recurrence.position]}${weekday}`)
  }
  const { end } = recurrence
  if (end._tag === "Count") parts.push(`COUNT=${end.count}`)
  if (end._tag === "Until")
    parts.push(
      `UNTIL=${
        allDay
          ? end.day.replaceAll("-", "")
          : compact(DateTime.subtract(Time.pragueMidnight(Time.addDays(end.day, 1)), { seconds: 1 }))
      }`
    )
  return `RRULE:${parts.join(";")}`
}

const moments = (when: Writer.When): Pick<GoogleCalendar.Body, "start" | "end"> =>
  when._tag === "Timed"
    ? { start: { dateTime: `${when.start}:00`, timeZone }, end: { dateTime: `${when.end}:00`, timeZone } }
    : { start: { date: when.first }, end: { date: Time.addDays(when.last, 1) } }

/** The Calendar API body of a write, each field only when it is given; Google tells only busy from free. */
export const bodyOf = (write: Writer.Write): GoogleCalendar.Body => ({
  ...(write.title === undefined ? {} : { summary: write.title }),
  ...(write.notes === undefined ? {} : { description: write.notes }),
  ...(write.location === undefined ? {} : { location: write.location }),
  ...(write.showAs === undefined ? {} : { transparency: write.showAs === "free" ? "transparent" : "opaque" }),
  ...(write.when === undefined ? {} : moments(write.when))
})

/** An event id Google takes: lowercase letters a to v and digits, so a UUID without its dashes. */
export const idOf = (key: string) => key.toLowerCase().replace(/[^a-v0-9]/g, "")

const within = <A>(
  calendar: Reclaim.SourceCalendar,
  write: (id: string) => Effect.Effect<A, Errors.SourceFailed>
): Effect.Effect<A, Errors.SourceFailed> =>
  Option.match(calendar.providerId, {
    onNone: () =>
      Effect.fail(
        new Errors.SourceFailed({ source: "google", reason: `"${calendar.name}" has no Google id in Reclaim.` })
      ),
    onSome: write
  })

const eventOf = (target: Writer.Target) => (target._tag === "Placed" ? target.id : target.entry.ref.id)

/** Writes through the Calendar API, where Reclaim's id of an event, an occurrence's included, is Google's own. */
export const make = Effect.gen(function* () {
  const google = yield* GoogleCalendar.GoogleCalendar

  return {
    create: (calendar, event) =>
      within(calendar, (id) =>
        google.insert(id, {
          ...bodyOf(event),
          ...(event.recurrence === undefined
            ? {}
            : { recurrence: [ruleOf(event.recurrence, event.when._tag === "AllDay")] }),
          id: idOf(event.key)
        })
      ),
    change: (calendar, target, write) => within(calendar, (id) => google.patch(id, eventOf(target), bodyOf(write))),
    cancel: (calendar, target) => within(calendar, (id) => google.remove(id, eventOf(target)))
  } satisfies Writer.Writer
})
