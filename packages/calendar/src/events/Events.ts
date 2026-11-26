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
import * as Calendar from "../model/Calendar.ts"
import * as Span from "../model/Span.ts"
import * as Event from "../model/Event.ts"
import * as EventWrites from "../model/EventWrites.ts"
import * as DraftRepository from "../calendars/DraftRepository.ts"
import * as GoogleWriter from "../google/Writer.ts"
import * as OutlookWriter from "../outlook/Writer.ts"
import * as Reclaim from "../reclaim/Reclaim.ts"
import * as Recurrence from "../model/Recurrence.ts"
import * as Rules from "../model/Rules.ts"
import type * as Writer from "../model/Writer.ts"

type When = Writer.When

const invalid = (reason: string) => Effect.fail(new Errors.Invalid({ reason }))

const plus = (local: Time.PragueLocal, millis: number) =>
  Effect.map(Time.toInstant(local), (instant) => Time.toPragueLocal(DateTime.add(instant, { milliseconds: millis })))

const days = (first: Time.PragueDate, last: Time.PragueDate) =>
  Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000)

/** A time that exists in Prague and ends after it starts; anything else is refused before a provider is called. */
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

const firstDayOf = (when: When) => (when._tag === "Timed" ? Time.PragueDate.make(when.start.slice(0, 10)) : when.first)

const refusedBy = (write: Rules.Write) =>
  Option.match(Rules.refusal(write), { onNone: () => Effect.void, onSome: Effect.fail })

const refuse = (code: string, reason: string, instead: string) =>
  Effect.fail(new Errors.Refused({ code: `calendar.${code}`, reason, instead }))

/** A calendar a new event can go to: Reclaim knows the id its provider gives it. */
const reachable = (target: CalendarRepository.Connected) =>
  Option.isSome(target.source.providerId)
    ? Effect.void
    : refuse(
        "calendar.unreachable",
        `"${target.calendar.name}" has no id of its provider in Reclaim, so ras cannot write to it.`,
        "Reconnect the calendar in Reclaim."
      )

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

/** A block's event: busy, its notes carrying the block's marker. */
const blockWrite = (block: BlockEvent) =>
  ({
    title: block.title,
    notes: Event.blockMarker(block.id),
    showAs: "busy",
    when: { _tag: "Timed", start: Time.toPragueLocal(block.span.start), end: Time.toPragueLocal(block.span.end) }
  }) satisfies Writer.Write

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
    /** Moves a block's event, by the id `placeBlock` returned in the calendar it placed it in. */
    readonly moveBlock: (
      calendar: Calendar.CalendarId,
      event: string,
      block: BlockEvent
    ) => Effect.Effect<void, Errors.NotFound | Errors.SourceFailed>
    readonly removeBlock: (
      calendar: Calendar.CalendarId,
      event: string
    ) => Effect.Effect<void, Errors.NotFound | Errors.SourceFailed>
  }
>()("@ras/calendar/Events") {
  static readonly layer = Layer.effect(
    Events,
    Effect.gen(function* () {
      const calendar = yield* Calendars.Calendar
      const reclaim = yield* Reclaim.Reclaim
      const writers: Record<CalendarRepository.Provider, Writer.Writer> = {
        outlook: yield* OutlookWriter.make,
        google: yield* GoogleWriter.make
      }
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
                "No calendar of an account connected to ras is on, so ras has nowhere to write the event.",
                "Connect Outlook or Google under Settings, Connections, or turn one of its calendars on."
              )
            : refuse(
                "calendar.choose",
                `More than one calendar takes events: ${writable.map((entry) => `"${entry.calendar.name}"`).join(", ")}.`,
                "Name the calendar the event goes in."
              )
        })

      /** The writer of the calendar's account; one whose account is not connected to ras takes no write. */
      const writerOf = (connected: CalendarRepository.Connected) =>
        Option.match(connected.provider, {
          onNone: () =>
            Effect.fail(
              new Errors.SourceFailed({
                source: "calendar",
                reason: `"${connected.calendar.name}" is in no account connected to ras, so ras cannot write to it.`
              })
            ),
          onSome: (provider) => Effect.succeed(writers[provider])
        })

      /** Writes a new plain event into its calendar, which the rules allowed. */
      const write = (
        chosen: CalendarRepository.Connected,
        fields: Writer.Write & { readonly title: string },
        when: When,
        recurrence: Recurrence.Recurrence | undefined,
        key: string
      ) =>
        Effect.gen(function* () {
          yield* reachable(chosen)
          const writer = yield* writerOf(chosen)
          const created = yield* writer.create(chosen.source, { ...fields, when, recurrence, key })
          const result = createdOf(chosen.calendar.id, fields.title, when, recurrence !== undefined, created.link, null)
          yield* calendar.wrote
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

      const placed = (id: Calendar.CalendarId) =>
        Effect.flatMap(calendar.connected, (all) =>
          Errors.orNotFound("calendar", String(id))(Arr.findFirst(all, (entry) => entry.calendar.id === id))
        )

      const storedDraft = (id: Event.DraftId) => Effect.flatMap(drafts.byId(id), Errors.orNotFound("draft", id))

      return Events.of({
        create: (input) =>
          Effect.gen(function* () {
            const when = yield* whenOf(input)
            if (input.draft === true && input.repeat !== undefined)
              return yield* invalid("A repeating event cannot be a draft. Create it without repeat, or not as a draft.")
            const recurrence =
              input.repeat === undefined ? undefined : yield* Recurrence.of(firstDayOf(when), input.repeat)
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
            yield* Effect.flatMap(writerOf(found.calendar), (writer) =>
              writer.change(
                found.calendar.source,
                { _tag: "Read", entry: found.entry },
                {
                  title: change.title,
                  notes: change.notes,
                  location: change.location,
                  showAs: change.showAs,
                  when: Option.getOrUndefined(when)
                }
              )
            )
            const after = new Event.Event({
              ...before,
              ...Option.match(when, { onNone: () => ({}), onSome: viewOf }),
              title: change.title ?? before.title,
              location: change.location ?? before.location,
              notes: change.notes ?? before.notes,
              showAs: change.showAs ?? before.showAs
            })
            const diff = Global.changed(Global.snapshot(Event.Event, before), Global.snapshot(Event.Event, after))
            yield* calendar.wrote
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
            yield* Effect.flatMap(writerOf(found.calendar), (writer) =>
              writer.cancel(found.calendar.source, { _tag: "Read", entry: found.entry })
            )
            yield* calendar.wrote
            yield* audit("calendar.event.cancelled", `event/${id}`, undefined, before, null)
          }),

        reply: (id, reply) =>
          Effect.gen(function* () {
            const found = yield* calendar.find(id)
            yield* refusedBy({ _tag: "Reply", calendar: found.calendar.calendar, event: found.entry })
            yield* reclaim.reply(found.entry.ref.calendar, found.entry.ref.id, reply)
            yield* calendar.wrote
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
            const chosen = yield* placed(id)
            yield* refusedBy({ _tag: "Create", calendar: chosen.calendar })
            yield* reachable(chosen)
            const writer = yield* writerOf(chosen)
            const created = yield* writer.create(chosen.source, { ...blockWrite(block), key: block.id })
            yield* calendar.wrote
            return created.id
          }),

        moveBlock: (id, event, block) =>
          Effect.gen(function* () {
            const chosen = yield* placed(id)
            const writer = yield* writerOf(chosen)
            yield* writer.change(chosen.source, { _tag: "Placed", id: event }, blockWrite(block))
            yield* calendar.wrote
          }),

        removeBlock: (id, event) =>
          Effect.gen(function* () {
            const chosen = yield* placed(id)
            const writer = yield* writerOf(chosen)
            yield* writer.cancel(chosen.source, { _tag: "Placed", id: event })
            yield* calendar.wrote
          })
      })
    })
  )
}
