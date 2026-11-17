import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Global from "@ras/global"
import * as Errors from "@ras/kernel/Errors"
import * as Time from "@ras/kernel/Time"
import * as Calendar from "./Calendar.ts"
import * as Domain from "./Domain.ts"
import * as Outlook from "./Outlook.ts"
import * as Reclaim from "./Reclaim.ts"
import * as Rules from "./Rules.ts"
import type * as Store from "./Store.ts"

type Write<A> = Effect.Effect<
  A,
  Errors.Refused | Errors.NotFound | Errors.Invalid | Errors.SourceFailed,
  Global.CurrentActor
>

/** When an event happens, in Prague local time: a start and an end, or whole days from the first to the last. */
export type When =
  | { readonly _tag: "Timed"; readonly start: Time.PragueLocal; readonly end: Time.PragueLocal }
  | { readonly _tag: "AllDay"; readonly first: Time.PragueDate; readonly last: Time.PragueDate }

const invalid = (reason: string) => Effect.fail(new Errors.Invalid({ reason }))

const plus = (local: Time.PragueLocal, millis: number) =>
  Effect.map(Time.toInstant(local), (instant) => Time.toPragueLocal(DateTime.add(instant, { milliseconds: millis })))

const days = (first: Time.PragueDate, last: Time.PragueDate) =>
  Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000)

/** A time that exists in Prague and ends after it starts; anything else is refused before Graph is called. */
const checked = (when: When): Effect.Effect<When, Errors.Invalid> =>
  when._tag === "AllDay"
    ? days(when.first, when.last) < 0
      ? invalid(`The event's last day, ${when.last}, is before its first, ${when.first}.`)
      : Effect.succeed(when)
    : Effect.gen(function* () {
        const start = yield* Time.toInstant(when.start)
        const end = yield* Time.toInstant(when.end)
        return DateTime.isGreaterThan(end, start)
          ? when
          : yield* invalid(`The event ends at ${when.end}, which is not after its start, ${when.start}.`)
      })

/** The time a new event takes: a start, an hour long unless it has an end, or a first day and a last. */
export const whenOf = (input: Domain.NewEvent): Effect.Effect<When, Errors.Invalid> => {
  if (input.start !== undefined && input.firstDay === undefined && input.lastDay === undefined) {
    const start = input.start
    return Effect.flatMap(input.end === undefined ? plus(start, 3_600_000) : Effect.succeed(input.end), (end) =>
      checked({ _tag: "Timed", start, end })
    )
  }
  if (input.firstDay !== undefined && input.start === undefined && input.end === undefined)
    return checked({ _tag: "AllDay", first: input.firstDay, last: input.lastDay ?? input.firstDay })
  return invalid("Give a timed event start and end, or an all-day event firstDay and lastDay, not both.")
}

const whenOfEntry = (entry: Domain.Entry): When =>
  entry.allDay
    ? {
        _tag: "AllDay",
        first: Time.pragueDateOf(entry.span.start),
        last: Time.addDays(Time.pragueDateOf(entry.span.end), -1)
      }
    : { _tag: "Timed", start: Time.toPragueLocal(entry.span.start), end: Time.toPragueLocal(entry.span.end) }

/** The time a change gives an event. A new start without an end keeps the event's length; so does a new first day. */
export const changedWhen = (
  current: When,
  change: Domain.EventChange
): Effect.Effect<Option.Option<When>, Errors.Invalid> => {
  const timed = change.start !== undefined || change.end !== undefined
  const allDay = change.firstDay !== undefined || change.lastDay !== undefined
  if (!timed && !allDay) return Effect.succeed(Option.none())
  if (current._tag === "Timed") {
    if (allDay) return invalid("The event is timed, so it takes start and end, not firstDay and lastDay.")
    return Effect.gen(function* () {
      const length =
        DateTime.toEpochMillis(yield* Time.toInstant(current.end)) -
        DateTime.toEpochMillis(yield* Time.toInstant(current.start))
      const start = change.start ?? current.start
      const end = change.end ?? (change.start === undefined ? current.end : yield* plus(start, length))
      return Option.some(yield* checked({ _tag: "Timed", start, end }))
    })
  }
  if (timed) return invalid("The event is all-day, so it takes firstDay and lastDay, not start and end.")
  const first = change.firstDay ?? current.first
  const last =
    change.lastDay ??
    (change.firstDay === undefined ? current.last : Time.addDays(first, days(current.first, current.last)))
  return Effect.map(checked({ _tag: "AllDay", first, last }), Option.some)
}

const clock = (local: string): Outlook.Clock => ({ dateTime: `${local}:00`, timeZone: Outlook.timeZone })

const schedule = (when: When): Outlook.Write =>
  when._tag === "Timed"
    ? { start: clock(when.start), end: clock(when.end), isAllDay: false }
    : { start: clock(`${when.first}T00:00`), end: clock(`${Time.addDays(when.last, 1)}T00:00`), isAllDay: true }

const firstDayOf = (when: When) => (when._tag === "Timed" ? Time.PragueDate.make(when.start.slice(0, 10)) : when.first)

const weekdays: ReadonlyArray<Domain.Weekday> = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
]

const weekdayOf = (date: Time.PragueDate) => weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()]!

/** Graph's patterned recurrence for a repeat, starting on the event's first day, its clock kept in Prague. */
export const recurrenceOf = (
  start: Time.PragueDate,
  repeat: Domain.Repeat
): Effect.Effect<Outlook.Recurrence, Errors.Invalid> =>
  Effect.gen(function* () {
    if (repeat.until !== undefined && repeat.count !== undefined)
      return yield* invalid("Give repeat until or count, not both.")
    if (repeat.on !== undefined && repeat.every !== "week")
      return yield* invalid("repeat on applies to a weekly repeat only.")
    if (repeat.until !== undefined && days(start, repeat.until) < 0)
      return yield* invalid(`The repeat ends on ${repeat.until}, before the event starts.`)
    const weekday = weekdayOf(start)
    if (repeat.on !== undefined && !repeat.on.includes(weekday))
      return yield* invalid(`A weekly repeat starting on ${start} must include ${weekday}.`)
    const [, month, day] = start.split("-").map(Number) as [number, number, number]
    const interval = repeat.interval ?? 1
    const pattern: Outlook.Recurrence["pattern"] =
      repeat.every === "day"
        ? { type: "daily", interval }
        : repeat.every === "week"
          ? {
              type: "weekly",
              interval,
              daysOfWeek: weekdays.filter((name) => (repeat.on ?? [weekday]).includes(name)),
              firstDayOfWeek: "monday"
            }
          : repeat.every === "month"
            ? { type: "absoluteMonthly", interval, dayOfMonth: day }
            : { type: "absoluteYearly", interval, dayOfMonth: day, month }
    const range: Outlook.Recurrence["range"] =
      repeat.until !== undefined
        ? { type: "endDate", startDate: start, endDate: repeat.until, recurrenceTimeZone: Outlook.timeZone }
        : repeat.count !== undefined
          ? {
              type: "numbered",
              startDate: start,
              numberOfOccurrences: repeat.count,
              recurrenceTimeZone: Outlook.timeZone
            }
          : { type: "noEnd", startDate: start, recurrenceTimeZone: Outlook.timeZone }
    return { pattern, range }
  })

const refusedBy = (write: Rules.Write) =>
  Option.match(Rules.refusal(write), { onNone: () => Effect.void, onSome: Effect.fail })

const refuse = (code: string, reason: string, instead: string) =>
  Effect.fail(new Errors.Refused({ code: `calendar.${code}`, reason, instead }))

const graphCalendar = (target: Store.Connected) =>
  Option.match(target.source.providerId, {
    onNone: () =>
      refuse(
        "calendar.unreachable",
        `"${target.calendar.name}" has no Outlook id in Reclaim, so ras cannot write to it.`,
        "Reconnect the calendar in Reclaim."
      ),
    onSome: Effect.succeed
  })

const rsvpOf: Record<Domain.Reply, Domain.Rsvp> = { accept: "accepted", tentative: "tentative", decline: "declined" }

export class Events extends Context.Service<
  Events,
  {
    readonly create: (event: Domain.NewEvent) => Write<Domain.Created>
    readonly change: (id: Domain.EventId, change: Domain.EventChange) => Write<Domain.Event>
    readonly cancel: (id: Domain.EventId) => Write<void>
    readonly reply: (id: Domain.EventId, reply: Domain.Reply) => Write<void>
  }
>()("@ras/calendar/Events") {
  static readonly layer = Layer.effect(
    Events,
    Effect.gen(function* () {
      const calendar = yield* Calendar.Calendar
      const reclaim = yield* Reclaim.Reclaim
      const outlook = yield* Outlook.Outlook
      const writes = yield* Global.Writes

      const audit = <A>(
        action: Global.Action,
        subject: string,
        result: A,
        before: object | null,
        after: object | null
      ) =>
        writes.run(
          action,
          Effect.succeed({
            result,
            subject,
            before: Option.fromNullOr(before as Global.Snapshot | null),
            after: Option.fromNullOr(after as Global.Snapshot | null)
          })
        )

      /** The calendar a new event goes to: the one named, or the one personal calendar there is. */
      const target = (named: Domain.CalendarId | undefined) =>
        Effect.gen(function* () {
          const all = yield* calendar.connected
          if (named !== undefined) {
            const found = Arr.findFirst(all, (entry) => entry.calendar.id === named)
            return yield* Option.match(found, {
              onNone: () => Effect.fail(new Errors.NotFound({ subject: "calendar", id: String(named) })),
              onSome: Effect.succeed
            })
          }
          const personal = all.filter((entry) => entry.calendar.enabled && entry.calendar.role === "personal")
          if (personal.length === 1) return personal[0]!
          return yield* personal.length === 0
            ? refuse(
                "calendar.none",
                "No calendar is marked personal yet, so ras has nowhere to write the event.",
                "Mark the Outlook calendar personal under Settings, Calendars."
              )
            : refuse(
                "calendar.choose",
                `More than one calendar is personal: ${personal.map((entry) => `"${entry.calendar.name}"`).join(", ")}.`,
                "Name the calendar the event goes in."
              )
        })

      /** The Graph id a change to the event takes: its own, or its occurrence's when it is part of a series. */
      const graphEvent = (found: { readonly calendar: Store.Connected; readonly entry: Domain.Entry }) =>
        Effect.flatMap(reclaim.providerId(found.calendar.source, found.entry.ref.id), (series) =>
          found.entry.recurring
            ? outlook.occurrence(series, Time.toPragueLocal(found.entry.span.start))
            : Effect.succeed(series)
        )

      return Events.of({
        create: (input) =>
          Effect.gen(function* () {
            const when = yield* whenOf(input)
            const recurrence =
              input.repeat === undefined ? undefined : yield* recurrenceOf(firstDayOf(when), input.repeat)
            const chosen = yield* target(input.calendar)
            yield* refusedBy({ _tag: "Create", calendar: chosen.calendar })
            const graphId = yield* graphCalendar(chosen)
            const created = yield* outlook.create(graphId, {
              subject: input.title,
              ...schedule(when),
              ...(input.notes === undefined ? {} : { body: { contentType: "text", content: input.notes } }),
              ...(input.location === undefined ? {} : { location: { displayName: input.location } }),
              ...(input.showAs === undefined ? {} : { showAs: input.showAs }),
              ...(recurrence === undefined ? {} : { recurrence }),
              transactionId: crypto.randomUUID()
            })
            const result = new Domain.Created({
              calendar: chosen.calendar.id,
              title: input.title,
              start: when._tag === "Timed" ? when.start : Time.PragueLocal.make(`${when.first}T00:00`),
              end: when._tag === "Timed" ? when.end : Time.PragueLocal.make(`${Time.addDays(when.last, 1)}T00:00`),
              allDay: when._tag === "AllDay",
              recurring: recurrence !== undefined,
              link: created.link
            })
            yield* calendar.refresh
            return yield* audit(
              "calendar.event.created",
              `calendar/${chosen.calendar.id}/event/${created.id}`,
              result,
              null,
              Global.snapshot(Domain.Created, result)
            )
          }),

        change: (id, change) =>
          Effect.gen(function* () {
            if (Object.keys(change).length === 0)
              return yield* invalid("Nothing to change. Give a title, a time, a location, notes or show-as.")
            const found = yield* calendar.find(id)
            yield* refusedBy({ _tag: "Change", calendar: found.calendar.calendar, event: found.entry })
            const when = yield* changedWhen(whenOfEntry(found.entry), change)
            const event = yield* graphEvent(found)
            yield* outlook.change(event, {
              ...(change.title === undefined ? {} : { subject: change.title }),
              ...Option.match(when, { onNone: () => ({}), onSome: schedule }),
              ...(change.notes === undefined ? {} : { body: { contentType: "text", content: change.notes } }),
              ...(change.location === undefined ? {} : { location: { displayName: change.location } }),
              ...(change.showAs === undefined ? {} : { showAs: change.showAs })
            })
            const before = Domain.eventOf(found.entry)
            const after = new Domain.Event({
              ...before,
              title: change.title ?? before.title,
              ...Option.match(when, {
                onNone: () => ({}),
                onSome: (next) =>
                  next._tag === "Timed"
                    ? { start: next.start, end: next.end }
                    : {
                        start: Time.PragueLocal.make(`${next.first}T00:00`),
                        end: Time.PragueLocal.make(`${Time.addDays(next.last, 1)}T00:00`)
                      }
              }),
              location: change.location ?? before.location,
              notes: change.notes ?? before.notes,
              showAs: change.showAs ?? before.showAs
            })
            const diff = Global.changed(Global.snapshot(Domain.Event, before), Global.snapshot(Domain.Event, after))
            yield* calendar.refresh
            return yield* audit("calendar.event.changed", `event/${id}`, after, diff.before, diff.after)
          }),

        cancel: (id) =>
          Effect.gen(function* () {
            const found = yield* calendar.find(id)
            yield* refusedBy({ _tag: "Cancel", calendar: found.calendar.calendar, event: found.entry })
            yield* outlook.cancel(yield* graphEvent(found))
            yield* calendar.refresh
            yield* audit(
              "calendar.event.cancelled",
              `event/${id}`,
              undefined,
              Global.snapshot(Domain.Event, Domain.eventOf(found.entry)),
              null
            )
          }),

        reply: (id, reply) =>
          Effect.gen(function* () {
            const found = yield* calendar.find(id)
            yield* refusedBy({ _tag: "Reply", calendar: found.calendar.calendar, event: found.entry })
            yield* reclaim.reply(found.entry.ref.calendar, found.entry.ref.id, reply)
            yield* calendar.refresh
            yield* audit(
              "calendar.event.replied",
              `event/${id}`,
              undefined,
              { rsvp: found.entry.rsvp },
              { rsvp: rsvpOf[reply] }
            )
          })
      })
    })
  )
}
