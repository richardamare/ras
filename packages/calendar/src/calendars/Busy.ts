import * as Arr from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as Time from "@ras/kernel/Time"
import * as Domain from "../Domain.ts"
import * as Rules from "../events/Rules.ts"

const millis = DateTime.toEpochMillis

/** The part of `span` inside `window`, or none when they do not overlap. */
export const clip = (span: Domain.Span, window: Domain.Span): Option.Option<Domain.Span> => {
  const start = DateTime.max(span.start, window.start)
  const end = DateTime.min(span.end, window.end)
  return DateTime.isGreaterThan(end, start) ? Option.some({ start, end }) : Option.none()
}

/** The time the spans take inside `window`, merged where they overlap or touch, in order. */
export const merge = (spans: ReadonlyArray<Domain.Span>, window: Domain.Span): ReadonlyArray<Domain.Span> =>
  Arr.reduce(
    Arr.getSomes(Arr.map(spans, (span) => clip(span, window))).toSorted((a, b) => millis(a.start) - millis(b.start)),
    [] as ReadonlyArray<Domain.Span>,
    (merged, span) => {
      const last = merged.at(-1)
      return last !== undefined && millis(span.start) <= millis(last.end)
        ? [...merged.slice(0, -1), { start: last.start, end: DateTime.max(last.end, span.end) }]
        : [...merged, span]
    }
  )

const minutesOf = (span: Domain.Span) => Math.round((millis(span.end) - millis(span.start)) / 60_000)

/** The gaps of at least `minimum` minutes in `window` that no blocking event takes. */
export const freeTime = (
  entries: ReadonlyArray<Domain.Entry>,
  window: Domain.Span,
  minimum: number
): ReadonlyArray<Domain.Slot> => {
  const busy = merge(
    Arr.map(Arr.filter(entries, Domain.blocks), (entry) => entry.span),
    window
  )
  const edges = [window.start, ...Arr.flatMap(busy, (span) => [span.start, span.end]), window.end]
  return Arr.filterMap(Arr.range(0, busy.length), (index) => {
    const gap = { start: edges[index * 2]!, end: edges[index * 2 + 1]! }
    return minutesOf(gap) >= minimum
      ? Result.succeed(
          new Domain.Slot({
            start: Time.toPragueLocal(gap.start),
            end: Time.toPragueLocal(gap.end),
            minutes: minutesOf(gap)
          })
        )
      : Result.failVoid
  })
}

const sameEvent = (ref: Domain.EventRef, other: Domain.EventRef) =>
  ref.calendar === other.calendar && ref.id === other.id

const isCopyOf = (copy: Domain.Entry, original: Domain.Entry) =>
  Option.exists(copy.copyOf, (source) => sameEvent(source, original.ref))

/** What the calendar rules allow doing about one event of a conflict. */
const fixes = (entry: Domain.Entry, calendars: ReadonlyArray<Domain.Calendar>): ReadonlyArray<string> => {
  const calendar = calendars.find((found) => found.id === entry.ref.calendar)
  if (calendar === undefined) return []
  const change = Rules.refusal({ _tag: "Change", calendar, event: entry })
  const reply = Rules.refusal({ _tag: "Reply", calendar, event: entry })
  const allowed = [
    ...(Option.isNone(change) ? ["Move it with change_event.", "Cancel it with cancel_event."] : []),
    ...(Option.isNone(reply) ? ["Decline it with reply_to_event."] : []),
    ...(entry.kind === "reclaim" ? ["Reclaim moves it by itself when the time is needed."] : [])
  ]
  return allowed.length > 0
    ? allowed
    : Option.match(change, { onNone: () => [], onSome: (refused) => [refused.message] })
}

/**
 * Every pair of blocking events that overlap inside `window`, timed with timed and all-day with all-day, each with the
 * fixes the calendar rules allow. A copy never conflicts with its original.
 */
export const conflicts = (
  entries: ReadonlyArray<Domain.Entry>,
  calendars: ReadonlyArray<Domain.Calendar>,
  window: Domain.Span
): ReadonlyArray<Domain.Conflict> => {
  const blocking = Arr.filter(entries, (entry) => Domain.blocks(entry) && Option.isSome(clip(entry.span, window)))
  return Arr.flatMap(blocking, (first, index) =>
    Arr.filterMap(blocking.slice(index + 1), (second) => {
      if (first.allDay !== second.allDay || isCopyOf(first, second) || isCopyOf(second, first)) return Result.failVoid
      return Option.match(
        Option.flatMap(clip(first.span, second.span), (overlap) => clip(overlap, window)),
        {
          onNone: () => Result.failVoid,
          onSome: (overlap) =>
            Result.succeed(
              new Domain.Conflict({
                first: Domain.eventOf(first),
                second: Domain.eventOf(second),
                from: Time.toPragueLocal(overlap.start),
                to: Time.toPragueLocal(overlap.end),
                firstFixes: fixes(first, calendars),
                secondFixes: fixes(second, calendars)
              })
            )
        }
      )
    })
  ).toSorted((a, b) => a.from.localeCompare(b.from))
}
