import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Deferred from "effect/Deferred"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Ref from "effect/Ref"
import * as Global from "@ras/global"
import * as Errors from "@ras/kernel/Errors"
import * as Time from "@ras/kernel/Time"
import * as Busy from "./Busy.ts"
import * as BusyTime from "./BusyTime.ts"
import * as CalendarRepository from "./CalendarRepository.ts"
import * as CalendarSchema from "../model/Calendar.ts"
import * as Span from "../model/Span.ts"
import * as Event from "../model/Event.ts"
import * as DraftRepository from "./DraftRepository.ts"
import * as EventCacheRepository from "./EventCacheRepository.ts"
import * as Insights from "./Insights.ts"
import * as GoogleCalendar from "../google/GoogleCalendar.ts"
import * as Outlook from "../outlook/Outlook.ts"
import * as Reclaim from "../reclaim/Reclaim.ts"
import * as WorkHours from "./WorkHours.ts"

type Read<A> = Effect.Effect<A, Errors.SourceFailed>

/** The cache holds four weeks back and twelve ahead, read from Reclaim four weeks at a time. */
const behind = 28
const ahead = 84
const chunk = 28

/** A sync holds for two minutes, unless it ran before a write was a minute old, since Reclaim takes that long to show it. */
const lasts = Duration.minutes(2)
const settles = Duration.minutes(1)

const isStale = (synced: DateTime.Utc, wrote: Option.Option<DateTime.Utc>, now: DateTime.Utc) =>
  DateTime.isGreaterThanOrEqualTo(now, DateTime.addDuration(synced, lasts)) ||
  Option.exists(wrote, (at) => DateTime.isLessThan(synced, DateTime.addDuration(at, settles)))

/** The instants of a window of Prague local time; one that does not end after it starts is refused. */
export const spanOf = (window: Span.Window): Effect.Effect<Span.Span, Errors.Invalid> =>
  Effect.gen(function* () {
    const start = yield* Time.toInstant(window.from)
    const end = yield* Time.toInstant(window.to)
    return DateTime.isGreaterThan(end, start)
      ? { start, end }
      : yield* Effect.fail(new Errors.Invalid({ reason: `The window ends at ${window.to}, before it starts.` }))
  })

const overlaps = (entry: Event.Entry, span: Span.Span) =>
  DateTime.isLessThan(entry.span.start, span.end) && DateTime.isGreaterThan(entry.span.end, span.start)

const byStart = Order.combine(
  Order.mapInput(Order.Number, (entry: Event.Entry) => DateTime.toEpochMillis(entry.span.start)),
  Order.mapInput(Order.String, (entry: Event.Entry) => entry.title)
)

/** Each event once: only the `shown` calendars' events, and a copy left out when its original is among them. */
export const originals = (
  entries: ReadonlyArray<Event.Entry>,
  shown: ReadonlyArray<CalendarSchema.CalendarId>
): ReadonlyArray<Event.Entry> => {
  const visible = Arr.filter(entries, (entry) => shown.includes(entry.ref.calendar))
  const present = new Set(Arr.map(visible, (entry) => `${entry.ref.calendar}/${entry.ref.id}`))
  return Arr.filter(
    visible,
    (entry) => !Option.exists(entry.copyOf, (original) => present.has(`${original.calendar}/${original.id}`))
  )
}

/** A draft as the calendar shows it: a plain event of its calendar, marked as a draft. */
export const entryOfDraft = (draft: DraftRepository.Draft): Event.Entry => ({
  ref: { calendar: draft.calendar, date: Time.pragueDateOf(draft.span.start), id: Event.draftEventId(draft.id) },
  title: draft.title,
  span: draft.span,
  allDay: draft.allDay,
  kind: "plain",
  showAs: Option.getOrElse(draft.showAs, () => "busy" as const),
  rsvp: "none",
  cancelled: false,
  recurring: false,
  location: draft.location,
  category: Option.none(),
  notes: draft.notes,
  attendees: [],
  copyOf: Option.none(),
  draft: { id: draft.id, refusal: draft.refusal }
})

/** A block draft as the calendar shows it: a draft of its calendar, marked as the block's. */
export const entryOfBlockDraft = (draft: BusyTime.BlockDraft): Event.Entry => ({
  ref: { calendar: draft.calendar, date: Time.pragueDateOf(draft.span.start), id: `block-draft-${draft.id}` },
  title: draft.title,
  span: draft.span,
  allDay: false,
  kind: "plain",
  showAs: "busy",
  rsvp: "none",
  cancelled: false,
  recurring: false,
  location: Option.none(),
  category: Option.none(),
  notes: Option.some(Event.blockMarker(draft.id)),
  attendees: [],
  copyOf: Option.none(),
  draft: { id: Event.DraftId.make(draft.id), refusal: Option.none() }
})

const draftOf = (id: string) => (id.startsWith("draft-") ? Option.some(Event.DraftId.make(id.slice(6))) : Option.none())

export class Calendar extends Context.Service<
  Calendar,
  {
    /** The connected calendars with their settings; turned-off ones only with `includeDisabled`. */
    readonly calendars: (includeDisabled: boolean) => Read<ReadonlyArray<CalendarSchema.Calendar>>
    readonly changeCalendar: (
      id: CalendarSchema.CalendarId,
      change: CalendarSchema.CalendarChange
    ) => Effect.Effect<CalendarSchema.Calendar, Errors.NotFound | Errors.SourceFailed, Global.CurrentActor>
    /** The events and drafts of the enabled calendars that overlap the span, each once, in start order. */
    readonly entries: (span: Span.Span) => Read<ReadonlyArray<Event.Entry>>
    readonly events: (
      window: Span.Window
    ) => Effect.Effect<ReadonlyArray<Event.Event>, Errors.Invalid | Errors.SourceFailed>
    readonly event: (id: Event.EventId) => Effect.Effect<Event.Event, Errors.NotFound | Errors.SourceFailed>
    /** The gaps of at least `minimum` minutes in the window that no event of an enabled calendar takes. */
    readonly freeTime: (
      window: Span.Window,
      minimum: number
    ) => Effect.Effect<ReadonlyArray<Busy.Slot>, Errors.Invalid | Errors.SourceFailed>
    readonly conflicts: (
      window: Span.Window
    ) => Effect.Effect<ReadonlyArray<Busy.Conflict>, Errors.Invalid | Errors.SourceFailed>
    /**
     * The month's work hours; with `categories` only those categories count, and with `calendars` only those
     * calendars, a copy counting when its original's calendar is not among them.
     */
    readonly workHours: (
      month: WorkHours.Month,
      categories: ReadonlyArray<string>,
      calendars: ReadonlyArray<CalendarSchema.CalendarId>
    ) => Read<WorkHours.WorkHours>
    /** The Insights of a period; with `calendars`, only those of the shown calendars count, otherwise every shown one. */
    readonly insights: (
      period: Insights.Period,
      calendars: ReadonlyArray<CalendarSchema.CalendarId>
    ) => Read<Insights.Insights>
    /** Every connected calendar, turned-off ones too, with the handles a write to its provider needs. */
    readonly connected: Read<ReadonlyArray<CalendarRepository.Connected>>
    /** An event in any connected calendar, a turned-off one too, so the rules can say why it takes no write. */
    readonly find: (
      id: Event.EventId
    ) => Effect.Effect<
      { readonly calendar: CalendarRepository.Connected; readonly entry: Event.Entry },
      Errors.NotFound | Errors.SourceFailed
    >
    /** Notes a write to a calendar, so every read in the minute after it syncs from Reclaim first. */
    readonly wrote: Effect.Effect<void>
  }
>()("@ras/calendar/Calendar") {
  static readonly make = Effect.gen(function* () {
    const reclaim = yield* Reclaim.Reclaim
    const outlook = yield* Outlook.Outlook
    const google = yield* GoogleCalendar.GoogleCalendar
    const busy = yield* BusyTime.BusyTime
    const writes = yield* Global.Writes
    const calendars = yield* CalendarRepository.CalendarRepository
    const cache = yield* EventCacheRepository.EventCacheRepository
    const drafts = yield* DraftRepository.DraftRepository
    const lastWrite = yield* Ref.make(Option.none<DateTime.Utc>())
    const running = yield* Ref.make(Option.none<Deferred.Deferred<void, Errors.SourceFailed>>())

    const sync = Effect.gen(function* () {
      const today = Time.pragueDateOf(yield* DateTime.now)
      const first = Time.addDays(today, -behind)
      const starts = Arr.map(Arr.range(0, ahead / chunk + behind / chunk - 1), (index) =>
        Time.addDays(first, index * chunk)
      )
      const listed = yield* reclaim.calendars
      const entries = yield* Effect.forEach(starts, (start) => reclaim.events(start, Time.addDays(start, chunk)))
      const span = { start: Time.pragueMidnight(first), end: Time.pragueMidnight(Time.addDays(today, ahead)) }
      yield* cache.replace(
        listed,
        Arr.filter(Arr.flatten(entries), (entry) => overlaps(entry, span)),
        span,
        yield* DateTime.now
      )
    }).pipe(
      Effect.tapCause((cause) => Effect.logWarning("The calendar sync failed; the cache keeps what it had.", cause)),
      Effect.withSpan("calendar.sync")
    )

    /** The sync under way, joined by every read that arrives while it runs. */
    const shared = Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const mine = yield* Deferred.make<void, Errors.SourceFailed>()
        const joined = yield* Ref.modify(running, (found) =>
          Option.isSome(found) ? [found.value, found] : [mine, Option.some(mine)]
        )
        if (joined !== mine) return yield* restore(Deferred.await(joined))
        const exit = yield* Effect.exit(restore(sync))
        yield* Ref.set(running, Option.none())
        yield* Deferred.done(mine, exit)
        return yield* exit
      })
    )

    /**
     * The cache's state, synced first when it is stale; a failed sync leaves the cache as it was, and fails the read only
     * when there is no cache. Each read takes it once, since a read in the minute after a write syncs every time.
     */
    const current = Effect.gen(function* () {
      const state = yield* cache.state
      if (Option.isNone(state)) return yield* Effect.andThen(shared, cache.state)
      if (!isStale(state.value.syncedAt, yield* Ref.get(lastWrite), yield* DateTime.now)) return state
      return yield* Effect.andThen(Effect.exit(shared), cache.state)
    })

    type State = Option.Option<EventCacheRepository.SyncState>

    /** The accounts whose calendars ras writes, Outlook's first. */
    const accounts = Effect.map(
      Effect.all({ outlook: outlook.account, google: google.account }),
      (found): ReadonlyArray<CalendarRepository.Account> => [
        ...Option.toArray(Option.map(found.outlook, (email) => ({ provider: "outlook" as const, email }))),
        ...Option.toArray(Option.map(found.google, (email) => ({ provider: "google" as const, email })))
      ]
    )

    const listed = Effect.flatMap(accounts, calendars.connected)

    const connected = Effect.andThen(current, listed)

    const shownOf = (all: ReadonlyArray<CalendarRepository.Connected>) =>
      Arr.map(
        Arr.filter(all, ({ calendar }) => calendar.enabled),
        ({ calendar }) => calendar.id
      )

    /** Every shown calendar when none is chosen, otherwise the chosen ones that are shown, in the chosen order. */
    const countedOf = (
      all: ReadonlyArray<CalendarRepository.Connected>,
      chosen: ReadonlyArray<CalendarSchema.CalendarId>
    ) => {
      const visible = shownOf(all)
      return chosen.length === 0 ? visible : Arr.filter(chosen, (id) => visible.includes(id))
    }

    /** From the cache when it holds the span, otherwise from Reclaim. */
    const read = (state: State, span: Span.Span) =>
      Option.exists(
        state,
        (cached) =>
          DateTime.isLessThanOrEqualTo(cached.from, span.start) && DateTime.isGreaterThanOrEqualTo(cached.to, span.end)
      )
        ? cache.events(span)
        : Effect.map(
            reclaim.events(Time.pragueDateOf(span.start), Time.addDays(Time.pragueDateOf(span.end), 1)),
            Arr.filter((entry) => overlaps(entry, span))
          )

    /** The events and drafts of every connected calendar that overlap the span, copies included. */
    const gathered = (state: State, span: Span.Span) =>
      Effect.gen(function* () {
        const found = yield* read(state, span)
        const drafted = Arr.map(yield* drafts.inSpan(span), entryOfDraft)
        const blocks = Arr.map(yield* busy.drafts(span), entryOfBlockDraft)
        return [...found, ...drafted, ...blocks]
      })

    const entriesOf = (state: State, span: Span.Span) =>
      Effect.gen(function* () {
        return originals(yield* gathered(state, span), shownOf(yield* listed)).toSorted(byStart)
      })

    const entries = (span: Span.Span) => Effect.flatMap(current, (state) => entriesOf(state, span))

    return Calendar.of({
      calendars: (includeDisabled) =>
        Effect.map(connected, (all) =>
          Arr.filter(
            Arr.map(all, ({ calendar }) => calendar),
            (calendar) => includeDisabled || calendar.enabled
          )
        ),

      changeCalendar: (id, change) =>
        Effect.gen(function* () {
          const found = Arr.findFirst(yield* connected, ({ calendar }) => calendar.id === id)
          if (Option.isNone(found)) return yield* new Errors.NotFound({ subject: "calendar", id: String(id) })
          const before = found.value.calendar
          const after = new CalendarSchema.Calendar({ ...before, ...change })
          const diff = Global.changed(
            Global.snapshot(CalendarSchema.Calendar, before),
            Global.snapshot(CalendarSchema.Calendar, after)
          )
          return yield* writes.run(
            "calendar.calendar.changed",
            Effect.as(calendars.change(after), {
              result: after,
              subject: `calendar/${id}`,
              before: Option.some(diff.before),
              after: Option.some(diff.after)
            })
          )
        }),

      entries,

      events: (window) => Effect.flatMap(spanOf(window), entries).pipe(Effect.map(Arr.map(Event.eventOf))),

      event: (id) =>
        Effect.gen(function* () {
          const ref = Event.eventRef(id)
          const day = { start: Time.pragueMidnight(ref.date), end: Time.pragueMidnight(Time.addDays(ref.date, 1)) }
          const found = Arr.findFirst(
            yield* entries(day),
            (entry) => entry.ref.calendar === ref.calendar && entry.ref.id === ref.id
          )
          return Event.eventOf(yield* Errors.orNotFound("event", id)(found))
        }),

      freeTime: (window, minimum) =>
        Effect.flatMap(spanOf(window), (span) =>
          Effect.map(entries(span), (found) => Busy.freeTime(found, span, minimum))
        ),

      conflicts: (window) =>
        Effect.gen(function* () {
          const span = yield* spanOf(window)
          const state = yield* current
          const found = yield* entriesOf(state, span)
          const shownCalendars = Arr.map(yield* listed, ({ calendar }) => calendar)
          return Busy.conflicts(found, shownCalendars, span)
        }),

      workHours: (month, categories, chosen) =>
        Effect.gen(function* () {
          const state = yield* current
          const counted = countedOf(yield* listed, chosen)
          const found = originals(yield* gathered(state, WorkHours.spanOfMonth(month)), counted).toSorted(byStart)
          return WorkHours.report(found, month, categories, yield* DateTime.now)
        }),

      insights: (period, chosen) =>
        Effect.gen(function* () {
          const state = yield* current
          const counted = countedOf(yield* listed, chosen)
          const found = yield* gathered(state, Insights.spanOfPeriod(period))
          return Insights.report(originals(found, counted), period, counted, yield* DateTime.now)
        }),

      connected,

      find: (id) =>
        Effect.gen(function* () {
          const ref = Event.eventRef(id)
          const day = { start: Time.pragueMidnight(ref.date), end: Time.pragueMidnight(Time.addDays(ref.date, 1)) }
          const state = yield* current
          const all = yield* listed
          const entry = ref.id.startsWith("block-draft-")
            ? Arr.findFirst(Arr.map(yield* busy.drafts(day), entryOfBlockDraft), (found) => found.ref.id === ref.id)
            : yield* Option.match(draftOf(ref.id), {
                onNone: () =>
                  Effect.map(read(state, day), (found) =>
                    Arr.findFirst(
                      found,
                      (candidate) =>
                        candidate.ref.calendar === ref.calendar &&
                        candidate.ref.id === ref.id &&
                        candidate.ref.date === ref.date
                    )
                  ),
                onSome: (draft) =>
                  Effect.map(drafts.byId(draft), (found) =>
                    Option.filter(
                      Option.map(found, entryOfDraft),
                      (candidate) => candidate.ref.calendar === ref.calendar
                    )
                  )
              })
          const calendar = Arr.findFirst(all, (found) => found.calendar.id === ref.calendar)
          if (Option.isNone(entry) || Option.isNone(calendar))
            return yield* new Errors.NotFound({ subject: "event", id })
          return { calendar: calendar.value, entry: entry.value }
        }),

      wrote: Effect.flatMap(DateTime.now, (now) => Ref.set(lastWrite, Option.some(now)))
    })
  })

  static readonly layer = Layer.effect(Calendar, Calendar.make)
}
