import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Schedule from "effect/Schedule"
import * as Semaphore from "effect/Semaphore"
import * as SqlClient from "effect/sql/SqlClient"
import * as Global from "@ras/global"
import * as Errors from "@ras/kernel/Errors"
import * as Time from "@ras/kernel/Time"
import * as Busy from "./Busy.ts"
import * as Domain from "./Domain.ts"
import * as Reclaim from "./Reclaim.ts"
import * as Store from "./Store.ts"
import * as WorkHours from "./WorkHours.ts"

type Read<A> = Effect.Effect<A, Errors.SourceFailed>

/** The cache holds four weeks back and twelve ahead, read from Reclaim four weeks at a time. */
const behind = 28
const ahead = 84
const chunk = 28

/** The instants of a window of Prague local time; one that does not end after it starts is refused. */
export const spanOf = (window: Domain.Window): Effect.Effect<Domain.Span, Errors.Invalid> =>
  Effect.gen(function* () {
    const start = yield* Time.toInstant(window.from)
    const end = yield* Time.toInstant(window.to)
    return DateTime.isGreaterThan(end, start)
      ? { start, end }
      : yield* Effect.fail(new Errors.Invalid({ reason: `The window ends at ${window.to}, before it starts.` }))
  })

const overlaps = (entry: Domain.Entry, span: Domain.Span) =>
  DateTime.isLessThan(entry.span.start, span.end) && DateTime.isGreaterThan(entry.span.end, span.start)

const byStart = Order.combine(
  Order.mapInput(Order.Number, (entry: Domain.Entry) => DateTime.toEpochMillis(entry.span.start)),
  Order.mapInput(Order.String, (entry: Domain.Entry) => entry.title)
)

/** Each event once: only the `shown` calendars' events, and a copy left out when its original is among them. */
export const originals = (
  entries: ReadonlyArray<Domain.Entry>,
  shown: ReadonlyArray<Domain.CalendarId>
): ReadonlyArray<Domain.Entry> => {
  const visible = Arr.filter(entries, (entry) => shown.includes(entry.ref.calendar))
  const present = new Set(Arr.map(visible, (entry) => `${entry.ref.calendar}/${entry.ref.id}`))
  return Arr.filter(
    visible,
    (entry) => !Option.exists(entry.copyOf, (original) => present.has(`${original.calendar}/${original.id}`))
  )
}

/** A draft as the calendar shows it: a plain event of its calendar, marked as a draft. */
export const entryOfDraft = (draft: Store.Draft): Domain.Entry => ({
  ref: { calendar: draft.calendar, date: Time.pragueDateOf(draft.span.start), id: Domain.draftEventId(draft.id) },
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

const draftOf = (id: string) =>
  id.startsWith("draft-") ? Option.some(Domain.DraftId.make(id.slice(6))) : Option.none()

export class Calendar extends Context.Service<
  Calendar,
  {
    /** The connected calendars with their settings; turned-off ones only with `includeDisabled`. */
    readonly calendars: (includeDisabled: boolean) => Read<ReadonlyArray<Domain.Calendar>>
    readonly changeCalendar: (
      id: Domain.CalendarId,
      change: Domain.CalendarChange
    ) => Effect.Effect<Domain.Calendar, Errors.NotFound | Errors.SourceFailed, Global.CurrentActor>
    /** The events and drafts of the enabled calendars that overlap the span, each once, in start order. */
    readonly entries: (span: Domain.Span) => Read<ReadonlyArray<Domain.Entry>>
    readonly events: (
      window: Domain.Window
    ) => Effect.Effect<ReadonlyArray<Domain.Event>, Errors.Invalid | Errors.SourceFailed>
    readonly event: (id: Domain.EventId) => Effect.Effect<Domain.Event, Errors.NotFound | Errors.SourceFailed>
    /** The gaps of at least `minimum` minutes in the window that no event of an enabled calendar takes. */
    readonly freeTime: (
      window: Domain.Window,
      minimum: number
    ) => Effect.Effect<ReadonlyArray<Domain.Slot>, Errors.Invalid | Errors.SourceFailed>
    readonly conflicts: (
      window: Domain.Window
    ) => Effect.Effect<ReadonlyArray<Domain.Conflict>, Errors.Invalid | Errors.SourceFailed>
    /** The month's work hours; with `categories`, only those categories count. */
    readonly workHours: (month: Domain.Month, categories: ReadonlyArray<string>) => Read<Domain.WorkHours>
    /** Every connected calendar, turned-off ones too, with the handles a write to its provider needs. */
    readonly connected: Read<ReadonlyArray<Store.Connected>>
    /** An event in any connected calendar, a turned-off one too, so the rules can say why it takes no write. */
    readonly find: (
      id: Domain.EventId
    ) => Effect.Effect<
      { readonly calendar: Store.Connected; readonly entry: Domain.Entry },
      Errors.NotFound | Errors.SourceFailed
    >
    /** Reads the calendars and the cached span's events from Reclaim and replaces the cache with them. */
    readonly sync: Read<void>
    /** Syncs now and again shortly after, since Reclaim takes up to a minute to show a write. */
    readonly refresh: Effect.Effect<void>
  }
>()("@ras/calendar/Calendar") {
  static readonly make = Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const reclaim = yield* Reclaim.Reclaim
    const writes = yield* Global.Writes
    const db = Effect.provideService(SqlClient.SqlClient, sql)
    const one = yield* Semaphore.make(1)
    const scope = yield* Effect.scope

    const sync = Effect.gen(function* () {
      const today = Time.pragueDateOf(yield* DateTime.now)
      const first = Time.addDays(today, -behind)
      const starts = Arr.map(Arr.range(0, ahead / chunk + behind / chunk - 1), (index) =>
        Time.addDays(first, index * chunk)
      )
      const calendars = yield* reclaim.calendars
      const entries = yield* Effect.forEach(starts, (start) => reclaim.events(start, Time.addDays(start, chunk)))
      const span = { start: Time.pragueMidnight(first), end: Time.pragueMidnight(Time.addDays(today, ahead)) }
      yield* db(
        Store.replace(
          calendars,
          Arr.filter(Arr.flatten(entries), (entry) => overlaps(entry, span)),
          span,
          yield* DateTime.now
        )
      )
    }).pipe(one.withPermit, Effect.withSpan("calendar.sync"))

    /** The cache, filled by a first sync when it is still empty. */
    const filled = Effect.flatMap(db(Store.sync), (state) =>
      Option.isSome(state) ? Effect.succeed(state) : Effect.andThen(sync, db(Store.sync))
    )

    const connected = Effect.andThen(filled, db(Store.connected))

    const shown = Effect.map(connected, (all) =>
      Arr.map(
        Arr.filter(all, ({ calendar }) => calendar.enabled),
        ({ calendar }) => calendar.id
      )
    )

    /** From the cache when it holds the span, otherwise from Reclaim. */
    const read = (span: Domain.Span) =>
      Effect.flatMap(filled, (state) =>
        Option.exists(
          state,
          (cached) =>
            DateTime.isLessThanOrEqualTo(cached.from, span.start) &&
            DateTime.isGreaterThanOrEqualTo(cached.to, span.end)
        )
          ? db(Store.events(span))
          : Effect.map(
              reclaim.events(Time.pragueDateOf(span.start), Time.addDays(Time.pragueDateOf(span.end), 1)),
              Arr.filter((entry) => overlaps(entry, span))
            )
      )

    const entries = (span: Domain.Span) =>
      Effect.gen(function* () {
        const found = yield* read(span)
        const drafts = Arr.map(yield* db(Store.drafts(span)), entryOfDraft)
        return originals([...found, ...drafts], yield* shown).toSorted(byStart)
      })

    const quietly = sync.pipe(
      Effect.catchCause((cause) => Effect.logWarning("The calendar sync failed; the cache keeps what it had.", cause))
    )

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
          const after = new Domain.Calendar({ ...before, ...change })
          const diff = Global.changed(Global.snapshot(Domain.Calendar, before), Global.snapshot(Domain.Calendar, after))
          return yield* writes.run(
            "calendar.calendar.changed",
            Effect.as(db(Store.changeCalendar(after)), {
              result: after,
              subject: `calendar/${id}`,
              before: Option.some(diff.before),
              after: Option.some(diff.after)
            })
          )
        }),

      entries,

      events: (window) => Effect.flatMap(spanOf(window), entries).pipe(Effect.map(Arr.map(Domain.eventOf))),

      event: (id) =>
        Effect.gen(function* () {
          const ref = Domain.eventRef(id)
          const day = { start: Time.pragueMidnight(ref.date), end: Time.pragueMidnight(Time.addDays(ref.date, 1)) }
          const found = Arr.findFirst(
            yield* entries(day),
            (entry) => entry.ref.calendar === ref.calendar && entry.ref.id === ref.id
          )
          return yield* Option.match(found, {
            onNone: () => Effect.fail(new Errors.NotFound({ subject: "event", id })),
            onSome: (entry) => Effect.succeed(Domain.eventOf(entry))
          })
        }),

      freeTime: (window, minimum) =>
        Effect.flatMap(spanOf(window), (span) =>
          Effect.map(entries(span), (found) => Busy.freeTime(found, span, minimum))
        ),

      conflicts: (window) =>
        Effect.gen(function* () {
          const span = yield* spanOf(window)
          const found = yield* entries(span)
          const calendars = Arr.map(yield* connected, ({ calendar }) => calendar)
          return Busy.conflicts(found, calendars, span)
        }),

      workHours: (month, categories) =>
        Effect.map(entries(WorkHours.spanOfMonth(month)), (found) => WorkHours.report(found, month, categories)),

      connected,

      find: (id) =>
        Effect.gen(function* () {
          const ref = Domain.eventRef(id)
          const day = { start: Time.pragueMidnight(ref.date), end: Time.pragueMidnight(Time.addDays(ref.date, 1)) }
          const all = yield* connected
          const entry = yield* Option.match(draftOf(ref.id), {
            onNone: () =>
              Effect.map(read(day), (found) =>
                Arr.findFirst(
                  found,
                  (entry) =>
                    entry.ref.calendar === ref.calendar && entry.ref.id === ref.id && entry.ref.date === ref.date
                )
              ),
            onSome: (draft) =>
              Effect.map(db(Store.draftById(draft)), (found) =>
                Option.filter(Option.map(found, entryOfDraft), (entry) => entry.ref.calendar === ref.calendar)
              )
          })
          const calendar = Arr.findFirst(all, (found) => found.calendar.id === ref.calendar)
          if (Option.isNone(entry) || Option.isNone(calendar))
            return yield* new Errors.NotFound({ subject: "event", id })
          return { calendar: calendar.value, entry: entry.value }
        }),

      sync,

      refresh: Effect.asVoid(Effect.forkIn(Effect.andThen(quietly, Effect.delay(quietly, "45 seconds")), scope))
    })
  })

  /** The calendar, with a sync every two minutes for as long as the layer lives; a failed sync keeps the cache. */
  static readonly layer = Layer.effect(
    Calendar,
    Effect.tap(Calendar.make, (calendar) =>
      Effect.forkScoped(
        calendar.sync.pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("The calendar sync failed; the cache keeps what it had.", cause)
          ),
          Effect.repeat(Schedule.spaced("2 minutes"))
        )
      )
    )
  )
}
