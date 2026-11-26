import * as Effect from "effect/Effect"
import * as Errors from "@ras/kernel/Errors"
import * as Time from "@ras/kernel/Time"
import type * as EventWrites from "./EventWrites.ts"

export type Position = "first" | "second" | "third" | "fourth" | "last"

/** A checked repeat, starting on the event's first day; each provider spells it its own way. */
export interface Recurrence {
  readonly start: Time.PragueDate
  readonly every: EventWrites.Repeat["every"]
  readonly interval: number
  /** The weekdays a weekly repeat falls on, Sunday first. */
  readonly weekdays: ReadonlyArray<EventWrites.Weekday>
  /** For a monthly or yearly repeat on the start's weekday: where that day falls among its month's days of the weekday. */
  readonly position: Position | null
  readonly end:
    | { readonly _tag: "Until"; readonly day: Time.PragueDate }
    | { readonly _tag: "Count"; readonly count: number }
    | { readonly _tag: "Never" }
}

export const weekdays: ReadonlyArray<EventWrites.Weekday> = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
]

export const weekdayOf = (date: Time.PragueDate) => weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()]!

/** Where the day falls among the month's days of its weekday; a day in the month's final week is its last. */
const positionOf = (date: Time.PragueDate): Position =>
  Time.addDays(date, 7).slice(5, 7) === date.slice(5, 7)
    ? (["first", "second", "third", "fourth"] as const)[Math.floor((Number(date.slice(8, 10)) - 1) / 7)]!
    : "last"

const invalid = (reason: string) => Effect.fail(new Errors.Invalid({ reason }))

/** The repeat of an event that starts on `start`, refused when its parts contradict each other or the start. */
export const of = (start: Time.PragueDate, repeat: EventWrites.Repeat): Effect.Effect<Recurrence, Errors.Invalid> =>
  Effect.gen(function* () {
    if (repeat.until !== undefined && repeat.count !== undefined)
      return yield* invalid("Give repeat until or count, not both.")
    if (repeat.on !== undefined && repeat.every !== "week")
      return yield* invalid("repeat on applies to a weekly repeat only.")
    if (repeat.by !== undefined && repeat.every !== "month" && repeat.every !== "year")
      return yield* invalid("repeat by applies to a monthly or yearly repeat only.")
    if (repeat.until !== undefined && repeat.until < start)
      return yield* invalid(`The repeat ends on ${repeat.until}, before the event starts.`)
    const weekday = weekdayOf(start)
    if (repeat.on !== undefined && !repeat.on.includes(weekday))
      return yield* invalid(`A weekly repeat starting on ${start} must include ${weekday}.`)
    return {
      start,
      every: repeat.every,
      interval: repeat.interval ?? 1,
      weekdays: repeat.every === "week" ? weekdays.filter((name) => (repeat.on ?? [weekday]).includes(name)) : [],
      position: repeat.by === "weekday" ? positionOf(start) : null,
      end:
        repeat.until !== undefined
          ? { _tag: "Until", day: repeat.until }
          : repeat.count !== undefined
            ? { _tag: "Count", count: repeat.count }
            : { _tag: "Never" }
    }
  })
