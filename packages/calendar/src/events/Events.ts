import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Semaphore from "effect/Semaphore"
import * as Global from "@ras/global"
import * as Errors from "@ras/kernel/Errors"
import * as Id from "@ras/kernel/Id"
import * as Time from "@ras/kernel/Time"
import * as Calendars from "../calendars/Calendars.ts"
import type * as CalendarRepository from "../calendars/CalendarRepository.ts"
import * as Calendar from "../calendars/Calendar.ts"
import * as Span from "../calendars/Span.ts"
import * as Event from "./Event.ts"
import * as EventWrites from "./EventWrites.ts"
import * as DraftRepository from "./DraftRepository.ts"
import * as Outlook from "../outlook/Outlook.ts"
import * as Reclaim from "../reclaim/Reclaim.ts"
import * as Rules from "./Rules.ts"

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
export const whenOf = (input: EventWrites.NewEvent): Effect.Effect<When, Errors.Invalid> => {
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

const whenOfEntry = (entry: Event.Entry): When =>
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
  change: EventWrites.EventChange
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

const weekdays: ReadonlyArray<EventWrites.Weekday> = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
]

const weekdayOf = (date: Time.PragueDate) => weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()]!

/** Where the day falls among the month's days of its weekday; a day in the month's final week is its last. */
const indexOf = (date: Time.PragueDate) =>
  Time.addDays(date, 7).slice(5, 7) === date.slice(5, 7)
    ? (["first", "second", "third", "fourth"] as const)[Math.floor((Number(date.slice(8, 10)) - 1) / 7)]!
    : "last"

/** Graph's patterned recurrence for a repeat, starting on the event's first day, its clock kept in Prague. */
export const recurrenceOf = (
  start: Time.PragueDate,
  repeat: EventWrites.Repeat
): Effect.Effect<Outlook.Recurrence, Errors.Invalid> =>
  Effect.gen(function* () {
    if (repeat.until !== undefined && repeat.count !== undefined)
      return yield* invalid("Give repeat until or count, not both.")
    if (repeat.on !== undefined && repeat.every !== "week")
      return yield* invalid("repeat on applies to a weekly repeat only.")
    if (repeat.by !== undefined && repeat.every !== "month" && repeat.every !== "year")
      return yield* invalid("repeat by applies to a monthly or yearly repeat only.")
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
          : repeat.by === "weekday"
            ? repeat.every === "month"
              ? { type: "relativeMonthly", interval, daysOfWeek: [weekday], index: indexOf(start) }
              : { type: "relativeYearly", interval, daysOfWeek: [weekday], index: indexOf(start), month }
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

const graphCalendar = (target: CalendarRepository.Connected) =>
  Option.match(target.source.providerId, {
    onNone: () =>
      refuse(
        "calendar.unreachable",
        `"${target.calendar.name}" has no Outlook id in Reclaim, so ras cannot write to it.`,
        "Reconnect the calendar in Reclaim."
      ),
    onSome: Effect.succeed
  })

const rsvpOf: Record<EventWrites.Reply, Event.Rsvp> = {
  accept: "accepted",
  tentative: "tentative",
  decline: "declined"
}

/** The instants a time covers; an all-day event covers Prague midnight to the midnight after its last day. */
const spanOfWhen = (when: When): Effect.Effect<Span.Span, Errors.Invalid> =>
  when._tag === "AllDay"
    ? Effect.succeed({ start: Time.pragueMidnight(when.first), end: Time.pragueMidnight(Time.addDays(when.last, 1)) })
    : Effect.all({ start: Time.toInstant(when.start), end: Time.toInstant(when.end) })

const createdOf = (
  calendar: Calendar.CalendarId,
  title: string,
  when: When,
  recurring: boolean,
  link: string | null,
  draft: Event.EventId | null
) =>
  new EventWrites.Created({
    calendar,
    title,
    start: when._tag === "Timed" ? when.start : Time.PragueLocal.make(`${when.first}T00:00`),
    end: when._tag === "Timed" ? when.end : Time.PragueLocal.make(`${Time.addDays(when.last, 1)}T00:00`),
    allDay: when._tag === "AllDay",
    recurring,
    link,
    draft
  })

/** The fields of a plain event that a write sends to Graph, each one only when it is given. */
const fieldsOf = (fields: {
  readonly title?: string | undefined
  readonly notes?: string | undefined
  readonly location?: string | undefined
  readonly showAs?: Event.ShowAs | undefined
}): Outlook.Write => ({
  ...(fields.title === undefined ? {} : { subject: fields.title }),
  ...(fields.notes === undefined ? {} : { body: { contentType: "text", content: fields.notes } }),
  ...(fields.location === undefined ? {} : { location: { displayName: fields.location } }),
  ...(fields.showAs === undefined ? {} : { showAs: fields.showAs })
})

const viewOf = (when: When) =>
  when._tag === "Timed"
    ? { start: when.start, end: when.end }
    : {
        start: Time.PragueLocal.make(`${when.first}T00:00`),
        end: Time.PragueLocal.make(`${Time.addDays(when.last, 1)}T00:00`)
      }

/** A work block's event: the block's id, its title (the project and the task), and the span it takes. */
export interface BlockEvent {
  readonly id: string
  readonly title: string
  readonly span: Span.Span
}

const blockWrite = (block: BlockEvent): Outlook.Write => ({
  subject: block.title,
  body: { contentType: "text", content: Event.blockMarker(block.id) },
  start: clock(Time.toPragueLocal(block.span.start)),
  end: clock(Time.toPragueLocal(block.span.end)),
  isAllDay: false,
  showAs: "busy"
})

export class Events extends Context.Service<
  Events,
  {
    /** Writes a plain event into a writable calendar, or keeps it in ras as a draft. */
    readonly create: (event: EventWrites.NewEvent) => Global.Write<EventWrites.Created>
    /** Changes a plain event in its calendar, or a draft in ras. */
    readonly change: (id: Event.EventId, change: EventWrites.EventChange) => Global.Write<Event.Event>
    /** Cancels a plain event in its calendar, or discards a draft. */
    readonly cancel: (id: Event.EventId) => Global.Write<void>
    readonly reply: (id: Event.EventId, reply: EventWrites.Reply) => Global.Write<void>
    /** Writes a draft into its calendar as a new event; a draft the calendar refuses stays, with the reason. */
    readonly confirm: (id: Event.EventId) => Global.Write<EventWrites.Created>
    /** Every event draft, in start order. */
    readonly drafts: Effect.Effect<ReadonlyArray<Event.Event>>
    /** Deletes every event draft; none of them is in a calendar. */
    readonly discardDrafts: Effect.Effect<number, never, Global.CurrentActor>
    /** Writes a work block's event into a writable calendar, busy, its notes carrying the block's marker. */
    readonly placeBlock: (
      calendar: Calendar.CalendarId,
      block: BlockEvent
    ) => Effect.Effect<string, Errors.Refused | Errors.NotFound | Errors.SourceFailed>
    /** Moves a block's event, by the Graph id `placeBlock` returned. */
    readonly moveBlock: (event: string, block: BlockEvent) => Effect.Effect<void, Errors.SourceFailed>
    readonly removeBlock: (event: string) => Effect.Effect<void, Errors.SourceFailed>
  }
>()("@ras/calendar/Events") {
  static readonly layer = Layer.effect(
    Events,
    Effect.gen(function* () {
      const calendar = yield* Calendars.Calendar
      const reclaim = yield* Reclaim.Reclaim
      const outlook = yield* Outlook.Outlook
      const one = yield* Semaphore.make(1)
      const writes = yield* Global.Writes
      const drafts = yield* DraftRepository.DraftRepository
      const now = Effect.map(DateTime.now, DateTime.formatIso)

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

      /** The calendar a new event goes to: the one named, or the one writable calendar there is. */
      const target = (named: Calendar.CalendarId | undefined) =>
        Effect.gen(function* () {
          const all = yield* calendar.connected
          if (named !== undefined) {
            const found = Arr.findFirst(all, (entry) => entry.calendar.id === named)
            return yield* Errors.orNotFound("calendar", String(named))(found)
          }
          const writable = all.filter((entry) => entry.calendar.enabled && entry.calendar.writable)
          if (writable.length === 1) return writable[0]!
          return yield* writable.length === 0
            ? refuse(
                "calendar.none",
                "No calendar of the Outlook account connected to ras is on, so ras has nowhere to write the event.",
                "Connect Outlook under Settings, Connections, or turn one of its calendars on."
              )
            : refuse(
                "calendar.choose",
                `More than one calendar takes events: ${writable.map((entry) => `"${entry.calendar.name}"`).join(", ")}.`,
                "Name the calendar the event goes in."
              )
        })

      /** The Graph id a change to the event takes: its own, or its occurrence's when it is part of a series. */
      const graphEvent = (found: { readonly calendar: CalendarRepository.Connected; readonly entry: Event.Entry }) =>
        Effect.flatMap(reclaim.providerId(found.calendar.source, found.entry.ref.id), (series) =>
          found.entry.recurring
            ? outlook.occurrence(series, Time.toPragueLocal(found.entry.span.start))
            : Effect.succeed(series)
        )

      /** Writes a new plain event into its calendar, which the rules allowed. */
      const write = (
        chosen: CalendarRepository.Connected,
        fields: Parameters<typeof fieldsOf>[0] & { readonly title: string },
        when: When,
        recurrence: Outlook.Recurrence | undefined,
        transactionId: string
      ) =>
        Effect.gen(function* () {
          const created = yield* outlook.create(yield* graphCalendar(chosen), {
            ...fieldsOf(fields),
            ...schedule(when),
            ...(recurrence === undefined ? {} : { recurrence }),
            transactionId
          })
          const result = createdOf(chosen.calendar.id, fields.title, when, recurrence !== undefined, created.link, null)
          yield* calendar.refresh
          return yield* audit(
            "calendar.event.created",
            `calendar/${chosen.calendar.id}/event/${created.id}`,
            result,
            null,
            Global.snapshot(EventWrites.Created, result)
          )
        })

      const saveDraft = (action: Global.Action, draft: DraftRepository.Draft, before: Option.Option<Event.Event>) =>
        Effect.gen(function* () {
          const event = Event.eventOf(Calendars.entryOfDraft(draft))
          const shown = Option.match(before, {
            onNone: () => ({ before: Option.none(), after: Option.some(Global.snapshot(Event.Event, event)) }),
            onSome: (previous) => {
              const diff = Global.changed(Global.snapshot(Event.Event, previous), Global.snapshot(Event.Event, event))
              return { before: Option.some(diff.before), after: Option.some(diff.after) }
            }
          })
          return yield* writes.run(
            action,
            Effect.as(drafts.save(draft, yield* now), { result: event, subject: `draft/${draft.id}`, ...shown })
          )
        })

      const storedDraft = (id: Event.DraftId) => Effect.flatMap(drafts.byId(id), Errors.orNotFound("draft", id))

      return Events.of({
        create: (input) =>
          Effect.gen(function* () {
            const when = yield* whenOf(input)
            if (input.draft === true && input.repeat !== undefined)
              return yield* invalid("A repeating event cannot be a draft. Create it without repeat, or not as a draft.")
            const recurrence =
              input.repeat === undefined ? undefined : yield* recurrenceOf(firstDayOf(when), input.repeat)
            const chosen = yield* target(input.calendar)
            yield* refusedBy({ _tag: "Create", calendar: chosen.calendar })
            if (input.draft !== true) return yield* write(chosen, input, when, recurrence, crypto.randomUUID())
            const draft = yield* saveDraft(
              "calendar.draft.created",
              {
                id: yield* Id.generate(Event.DraftId),
                calendar: chosen.calendar.id,
                title: input.title,
                span: yield* spanOfWhen(when),
                allDay: when._tag === "AllDay",
                location: Option.fromUndefinedOr(input.location),
                notes: Option.fromUndefinedOr(input.notes),
                showAs: Option.fromUndefinedOr(input.showAs),
                refusal: Option.none()
              },
              Option.none()
            )
            return createdOf(chosen.calendar.id, input.title, when, false, null, draft.id)
          }),

        change: (id, change) =>
          Effect.gen(function* () {
            if (Object.keys(change).length === 0)
              return yield* invalid("Nothing to change. Give a title, a time, a location, notes or show-as.")
            const found = yield* calendar.find(id)
            yield* refusedBy({ _tag: "Change", calendar: found.calendar.calendar, event: found.entry })
            const when = yield* changedWhen(whenOfEntry(found.entry), change)
            const before = Event.eventOf(found.entry)
            if (found.entry.draft !== undefined) {
              const stored = yield* storedDraft(found.entry.draft.id)
              return yield* saveDraft(
                "calendar.draft.changed",
                {
                  ...stored,
                  title: change.title ?? stored.title,
                  span: yield* Option.match(when, { onNone: () => Effect.succeed(stored.span), onSome: spanOfWhen }),
                  location: change.location === undefined ? stored.location : Option.some(change.location),
                  notes: change.notes === undefined ? stored.notes : Option.some(change.notes),
                  showAs: change.showAs === undefined ? stored.showAs : Option.some(change.showAs)
                },
                Option.some(before)
              )
            }
            yield* outlook.change(yield* graphEvent(found), {
              ...fieldsOf(change),
              ...Option.match(when, { onNone: () => ({}), onSome: schedule })
            })
            const after = new Event.Event({
              ...before,
              ...Option.match(when, { onNone: () => ({}), onSome: viewOf }),
              title: change.title ?? before.title,
              location: change.location ?? before.location,
              notes: change.notes ?? before.notes,
              showAs: change.showAs ?? before.showAs
            })
            const diff = Global.changed(Global.snapshot(Event.Event, before), Global.snapshot(Event.Event, after))
            yield* calendar.refresh
            return yield* audit("calendar.event.changed", `event/${id}`, after, diff.before, diff.after)
          }),

        cancel: (id) =>
          Effect.gen(function* () {
            const found = yield* calendar.find(id)
            yield* refusedBy({ _tag: "Cancel", calendar: found.calendar.calendar, event: found.entry })
            const before = Global.snapshot(Event.Event, Event.eventOf(found.entry))
            if (found.entry.draft !== undefined) {
              const draft = found.entry.draft.id
              return yield* writes.run(
                "calendar.draft.discarded",
                Effect.as(drafts.delete(draft), {
                  result: undefined,
                  subject: `draft/${draft}`,
                  before: Option.some(before),
                  after: Option.none()
                })
              )
            }
            yield* outlook.cancel(yield* graphEvent(found))
            yield* calendar.refresh
            yield* audit("calendar.event.cancelled", `event/${id}`, undefined, before, null)
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
          }),

        confirm: (id) =>
          Effect.gen(function* () {
            const found = yield* calendar.find(id)
            if (Option.isSome(Event.blockOf(found.entry)))
              return yield* refuse(
                "event.block",
                `"${found.entry.title}" is a work block's draft, which is confirmed with its block.`,
                "Confirm it with confirm_drafts."
              )
            if (found.entry.draft === undefined)
              return yield* refuse(
                "event.not-draft",
                `"${found.entry.title}" is not a draft, so there is nothing to confirm.`,
                "Change it with change_event instead."
              )
            const stored = yield* storedDraft(found.entry.draft.id)
            const fields = {
              title: stored.title,
              location: Option.getOrUndefined(stored.location),
              notes: Option.getOrUndefined(stored.notes),
              showAs: Option.getOrUndefined(stored.showAs)
            }
            const written = yield* refusedBy({ _tag: "Create", calendar: found.calendar.calendar }).pipe(
              Effect.andThen(write(found.calendar, fields, whenOfEntry(found.entry), undefined, stored.id)),
              Effect.tapError((error) =>
                error._tag === "Refused" || error._tag === "SourceFailed"
                  ? saveDraft(
                      "calendar.draft.refused",
                      { ...stored, refusal: Option.some(error.message) },
                      Option.some(Event.eventOf(found.entry))
                    )
                  : Effect.void
              )
            )
            return yield* writes.run(
              "calendar.draft.confirmed",
              Effect.as(drafts.delete(stored.id), {
                result: written,
                subject: `draft/${stored.id}`,
                before: Option.some(Global.snapshot(Event.Event, Event.eventOf(found.entry))),
                after: Option.none()
              })
            )
          }).pipe(one.withPermit),

        drafts: Effect.map(drafts.all, (found) => found.map((draft) => Event.eventOf(Calendars.entryOfDraft(draft)))),

        discardDrafts: Effect.gen(function* () {
          const found = yield* drafts.all
          if (found.length === 0) return 0
          return yield* writes.run(
            "calendar.draft.discarded",
            Effect.as(drafts.deleteAll, {
              result: found.length,
              subject: "drafts",
              before: Option.some({ drafts: found.map((draft) => draft.title) }),
              after: Option.none()
            })
          )
        }),

        placeBlock: (id, block) =>
          Effect.gen(function* () {
            const chosen = Arr.findFirst(yield* calendar.connected, (entry) => entry.calendar.id === id)
            if (Option.isNone(chosen)) return yield* new Errors.NotFound({ subject: "calendar", id: String(id) })
            yield* refusedBy({ _tag: "Create", calendar: chosen.value.calendar })
            const created = yield* outlook.create(yield* graphCalendar(chosen.value), {
              ...blockWrite(block),
              transactionId: block.id
            })
            yield* calendar.refresh
            return created.id
          }),

        moveBlock: (event, block) => Effect.andThen(outlook.change(event, blockWrite(block)), calendar.refresh),

        removeBlock: (event) => Effect.andThen(outlook.cancel(event), calendar.refresh)
      })
    })
  )
}
