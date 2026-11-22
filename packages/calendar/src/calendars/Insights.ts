import * as Arr from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as Time from "@ras/kernel/Time"
import * as Busy from "./Busy.ts"
import * as Calendar from "./Calendar.ts"
import * as Span from "./Span.ts"
import * as WorkHours from "./WorkHours.ts"
import * as Event from "../events/Event.ts"

export const PeriodKind = Schema.Literals(["week", "month", "quarter"])
export type PeriodKind = typeof PeriodKind.Type

/** A Monday-to-Sunday Prague week, a Prague month or a calendar quarter, named by a day inside it. */
export const Period = Schema.Struct({ kind: PeriodKind, date: Time.PragueDate })
export type Period = typeof Period.Type

export const Part = Schema.Struct({
  first: Time.PragueDate,
  last: Time.PragueDate,
  taken: Schema.Int,
  planned: Schema.Int
})
export type Part = typeof Part.Type

export const BlockTime = Schema.Struct({
  block: Schema.String.annotate({ description: "The work block, from the marker its event carries." }),
  minutes: Schema.Int
})
export type BlockTime = typeof BlockTime.Type

export const TitleTime = Schema.Struct({
  title: Schema.String,
  minutes: Schema.Int
})
export type TitleTime = typeof TitleTime.Type

export const CalendarTime = Schema.Struct({
  calendar: Calendar.CalendarId,
  taken: Schema.Int,
  planned: Schema.Int
})
export type CalendarTime = typeof CalendarTime.Type

/** An event of the period, its minutes the part of it the Insights count. */
export const ShownEvent = Schema.Struct({
  event: Event.EventId,
  calendar: Calendar.CalendarId,
  title: Schema.String,
  start: Time.PragueLocal,
  end: Time.PragueLocal,
  minutes: Schema.Int
})
export type ShownEvent = typeof ShownEvent.Type

export class Insights extends Schema.Class<Insights>("Insights")({
  period: Period,
  first: Time.PragueDate,
  last: Time.PragueDate,
  taken: Schema.Int.annotate({ description: "Minutes taken from the period's start up to now." }),
  planned: Schema.Int.annotate({ description: "Minutes planned from now until the period ends." }),
  parts: Schema.Array(Part).annotate({
    description: "A week's days, a month's weeks cut at its edges, or a quarter's months, adding up to the period."
  }),
  workBlocks: Schema.Struct({ minutes: Schema.Int, blocks: Schema.Array(BlockTime) }).annotate({
    description: "The taken time of work blocks, less the time other events share with them."
  }),
  otherEvents: Schema.Struct({ minutes: Schema.Int, titles: Schema.Array(TitleTime) }).annotate({
    description: "The taken time of every other event, by title; with the work blocks it adds up to the taken time."
  }),
  calendars: Schema.Array(CalendarTime).annotate({
    description: "Each chosen calendar's own time, its overlaps counted once."
  }),
  unanswered: Schema.Array(ShownEvent).annotate({
    description: "Invitations before now the owner never answered; their time counts as taken."
  }),
  unconfirmed: Schema.Struct({
    minutes: Schema.Int,
    drafts: Schema.Array(Schema.Struct({ ...ShownEvent.fields, block: Schema.NullOr(Schema.String) }))
  }).annotate({ description: "Drafts before now, which count as neither taken nor planned time." })
}) {}

interface Range {
  readonly first: Time.PragueDate
  /** The day after the last. */
  readonly end: Time.PragueDate
}

const spanOf = (range: Range): Span.Span => ({
  start: Time.pragueMidnight(range.first),
  end: Time.pragueMidnight(range.end)
})

const monthOf = (date: Time.PragueDate): Range => {
  const [year, month] = date.split("-").map(Number) as [number, number]
  const first = Time.PragueDate.make(`${date.slice(0, 7)}-01`)
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`
  return { first, end: Time.PragueDate.make(next) }
}

/** Days since the Monday of the date's week. */
const sinceMonday = (date: Time.PragueDate) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7

const rangeOf = (period: Period): Range => {
  switch (period.kind) {
    case "week": {
      const first = Time.addDays(period.date, -sinceMonday(period.date))
      return { first, end: Time.addDays(first, 7) }
    }
    case "month":
      return monthOf(period.date)
    case "quarter": {
      const month = Number(period.date.slice(5, 7))
      const first = Time.PragueDate.make(
        `${period.date.slice(0, 4)}-${String(month - ((month - 1) % 3)).padStart(2, "0")}-01`
      )
      return { first, end: monthOf(monthOf(monthOf(first).end).end).end }
    }
  }
}

/** The ranges that follow each other from `range.first`, each ending where `next` says or at the range's end. */
const cut = (range: Range, next: (first: Time.PragueDate) => Time.PragueDate): ReadonlyArray<Range> => {
  const end = next(range.first)
  return end < range.end
    ? [{ first: range.first, end }, ...cut({ first: end, end: range.end }, next)]
    : [{ first: range.first, end: range.end }]
}

const partsOf = (period: Period, range: Range): ReadonlyArray<Range> => {
  switch (period.kind) {
    case "week":
      return cut(range, (first) => Time.addDays(first, 1))
    case "month":
      return cut(range, (first) => Time.addDays(first, 7 - sinceMonday(first)))
    case "quarter":
      return cut(range, (first) => monthOf(first).end)
  }
}

const millis = DateTime.toEpochMillis

/** The parts of the spans that none of the `holes`, merged and in order, cover. */
const without = (spans: ReadonlyArray<Span.Span>, holes: ReadonlyArray<Span.Span>): ReadonlyArray<Span.Span> =>
  Arr.flatMap(spans, (span) =>
    Arr.reduce(holes, [span] as ReadonlyArray<Span.Span>, (left, hole) =>
      Arr.flatMap(left, (piece) =>
        millis(hole.end) <= millis(piece.start) || millis(hole.start) >= millis(piece.end)
          ? [piece]
          : Arr.filter(
              [
                { start: piece.start, end: DateTime.min(piece.end, hole.start) },
                { start: DateTime.max(piece.start, hole.end), end: piece.end }
              ],
              (rest) => millis(rest.end) > millis(rest.start)
            )
      )
    )
  )

const byKey = <A>(
  items: ReadonlyArray<A>,
  key: (item: A) => string,
  minutes: (group: ReadonlyArray<A>) => number
): ReadonlyArray<readonly [string, number]> =>
  Object.entries(Arr.groupBy(items, key))
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([name, group]) => [name, minutes(group)] as const)

/** The instants a period runs between. */
export const spanOfPeriod = (period: Period): Span.Span => spanOf(rangeOf(period))

interface Piece {
  readonly entry: Event.Entry
  readonly span: Span.Span
}

const spansOf = (pieces: ReadonlyArray<Piece>) => Arr.map(pieces, (piece) => piece.span)

const isUnanswered = (entry: Event.Entry) =>
  entry.kind === "invitation" && (entry.rsvp === "needsAction" || entry.rsvp === "none")

const shownEvent = (piece: Piece) => ({
  event: Event.eventId(piece.entry.ref),
  calendar: piece.entry.ref.calendar,
  title: piece.entry.title,
  start: Time.toPragueLocal(piece.entry.span.start),
  end: Time.toPragueLocal(piece.entry.span.end),
  minutes: WorkHours.minutes([piece.span], piece.span)
})

/**
 * The Insights of the chosen calendars' timed, blocking events in a period, the time before `now` taken and the time
 * after it planned. A draft before `now` is unconfirmed time instead of taken time.
 */
export const report = (
  entries: ReadonlyArray<Event.Entry>,
  period: Period,
  calendars: ReadonlyArray<Calendar.CalendarId>,
  now: DateTime.Utc
): Insights => {
  const range = rangeOf(period)
  const whole = spanOf(range)
  const split = DateTime.max(whole.start, DateTime.min(DateTime.startOf(now, "minute"), whole.end))
  const past = { start: whole.start, end: split }
  const future = { start: split, end: whole.end }
  const chosen = Arr.filter(entries, (entry) => calendars.includes(entry.ref.calendar))
  const within = (part: (entry: Event.Entry) => Option.Option<Span.Span>): ReadonlyArray<Piece> =>
    Arr.getSomes(Arr.map(chosen, (entry) => Option.map(part(entry), (span) => ({ entry, span }))))
  const taken = within((entry) => WorkHours.takenSpan(entry, past, now))
  const planned = within((entry) => WorkHours.takenSpan(entry, future, now))
  // As of the period's start, a draft's whole past part lies ahead, so the rule hands all of it back.
  const drafts = within((entry) =>
    entry.draft === undefined ? Option.none() : WorkHours.takenSpan(entry, past, past.start)
  )
  const [blocks, others] = Arr.partition(taken, (piece) =>
    Option.match(Event.blockOf(piece.entry), {
      onNone: () => Result.fail(piece),
      onSome: (block) => Result.succeed({ block, piece })
    })
  )
  const otherTime = Busy.merge(spansOf(others), past)
  const blockMinutes = (group: ReadonlyArray<{ readonly piece: Piece }>) =>
    WorkHours.minutes(
      without(
        Busy.merge(
          Arr.map(group, ({ piece }) => piece.span),
          past
        ),
        otherTime
      ),
      past
    )
  const ofCalendar = (pieces: ReadonlyArray<Piece>, calendar: Calendar.CalendarId) =>
    spansOf(Arr.filter(pieces, (piece) => piece.entry.ref.calendar === calendar))
  return new Insights({
    period,
    first: range.first,
    last: Time.addDays(range.end, -1),
    taken: WorkHours.minutes(spansOf(taken), past),
    planned: WorkHours.minutes(spansOf(planned), future),
    parts: Arr.map(partsOf(period, range), (part) => ({
      first: part.first,
      last: Time.addDays(part.end, -1),
      taken: WorkHours.minutes(spansOf(taken), spanOf(part)),
      planned: WorkHours.minutes(spansOf(planned), spanOf(part))
    })),
    workBlocks: {
      minutes: blockMinutes(blocks),
      blocks: Arr.map(
        byKey(blocks, (found) => found.block, blockMinutes),
        ([block, minutes]) => ({ block, minutes })
      )
    },
    otherEvents: {
      minutes: WorkHours.minutes(otherTime, past),
      titles: Arr.map(
        byKey(
          others,
          (piece) => piece.entry.title,
          (group) => WorkHours.minutes(spansOf(group), past)
        ),
        ([title, minutes]) => ({ title, minutes })
      )
    },
    calendars: Arr.map(calendars, (calendar) => ({
      calendar,
      taken: WorkHours.minutes(ofCalendar(taken, calendar), past),
      planned: WorkHours.minutes(ofCalendar(planned, calendar), future)
    })),
    unanswered: Arr.map(
      Arr.filter(taken, (piece) => isUnanswered(piece.entry)),
      shownEvent
    ),
    unconfirmed: {
      minutes: WorkHours.minutes(spansOf(drafts), past),
      drafts: Arr.map(drafts, (piece) => ({
        ...shownEvent(piece),
        block: Option.getOrNull(Event.blockOf(piece.entry))
      }))
    }
  })
}
