import { assert, describe, it, layer } from "@effect/vitest"
import * as Arr from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import * as SqlClient from "effect/sql/SqlClient"
import * as TestClock from "effect/testing/TestClock"
import * as Testing from "@ras/global/testing"
import * as Errors from "@ras/kernel/Errors"
import * as KernelModule from "@ras/kernel/Module"
import * as Time from "@ras/kernel/Time"
import * as BusyTime from "../../src/calendars/BusyTime.ts"
import * as Calendars from "../../src/calendars/Calendars.ts"
import * as CalendarRepository from "../../src/calendars/CalendarRepository.ts"
import * as Span from "../../src/model/Span.ts"
import * as Event from "../../src/model/Event.ts"
import * as DraftRepository from "../../src/calendars/DraftRepository.ts"
import * as EventCacheRepository from "../../src/calendars/EventCacheRepository.ts"
import * as Migrations from "../../src/Migrations.ts"
import * as Module from "../../src/Module.ts"
import * as GoogleCalendar from "../../src/google/GoogleCalendar.ts"
import * as Outlook from "../../src/outlook/Outlook.ts"
import * as Reclaim from "../../src/reclaim/Reclaim.ts"
import * as Sample from "../../src/reclaim/Sample.ts"

const today = Effect.map(DateTime.now, Time.pragueDateOf)

const days = (from: Time.PragueDate, count: number): Span.Window => ({
  from: Time.PragueLocal.make(`${from}T00:00`),
  to: Time.PragueLocal.make(`${Time.addDays(from, count)}T00:00`)
})

const titles = (events: ReadonlyArray<Event.Event>) =>
  events.map((event) => `${event.calendar} ${event.start} ${event.title}`)

layer(Testing.layer([Module.module], { RAS_SAMPLE: "true" }).pipe(Layer.provide(BusyTime.BusyTime.none)))(
  "the calendar",
  (test) => {
    test.effect("lists every connected calendar, writable in a connected account, and audits turning one off", () =>
      Effect.gen(function* () {
        const calendar = yield* Calendars.Calendar
        const listed = yield* calendar.calendars(false)
        assert.deepStrictEqual(
          listed.map((found) => [found.name, found.writable, found.enabled]),
          [
            ["Personal", true, true],
            ["Work (copy)", true, true],
            ["Work", false, true],
            ["Family", true, true]
          ]
        )
        const changed = yield* calendar.changeCalendar(Sample.work, { enabled: false })
        assert.strictEqual(changed.enabled, false)
        assert.deepStrictEqual(
          (yield* calendar.calendars(false)).map((found) => found.name),
          ["Personal", "Work (copy)", "Family"]
        )
        yield* calendar.changeCalendar(Sample.work, { enabled: true })
        const sql = yield* SqlClient.SqlClient
        const audit = yield* sql<{ action: string; before: string; after: string }>`
        SELECT action, before, after FROM global_audit_entries WHERE subject = ${`calendar/${Sample.work}`}`
        assert.deepStrictEqual(audit, [
          { action: "calendar.calendar.changed", before: '{"enabled":true}', after: '{"enabled":false}' },
          { action: "calendar.calendar.changed", before: '{"enabled":false}', after: '{"enabled":true}' }
        ])
      })
    )

    test.effect("shows each event once, folding Calendar Sync's copy onto its original", () =>
      Effect.gen(function* () {
        const calendar = yield* Calendars.Calendar
        const first = yield* today
        const events = yield* calendar.events(days(Time.addDays(first, 2), 1))
        assert.deepStrictEqual(titles(events), [
          `201 ${Time.addDays(first, 2)}T09:00 Standup`,
          `101 ${Time.addDays(first, 2)}T12:00 Lunch`,
          `101 ${Time.addDays(first, 2)}T14:00 Dentist`,
          `201 ${Time.addDays(first, 2)}T14:30 Quarterly review`
        ])
        const review = events[3]!
        assert.strictEqual(review.kind, "invitation")
        assert.strictEqual(review.rsvp, "needsAction")
        assert.deepStrictEqual(yield* calendar.event(review.id), review)
      })
    )

    test.effect("shows the copy when the original's calendar is turned off, and hides the calendar", () =>
      Effect.gen(function* () {
        const calendar = yield* Calendars.Calendar
        const first = yield* today
        yield* calendar.changeCalendar(Sample.work, { enabled: false })
        const events = yield* calendar.events(days(first, 1))
        assert.deepStrictEqual(
          events.map((event) => [event.calendar, event.title, event.kind]),
          [
            [Sample.workCopy, "Standup", "copy"],
            [Sample.personal, "Lunch", "reclaim"]
          ]
        )
        assert.deepStrictEqual(
          (yield* calendar.calendars(false)).map((found) => found.name),
          ["Personal", "Work (copy)", "Family"]
        )
        assert.strictEqual((yield* calendar.calendars(true)).length, 4)
        yield* calendar.changeCalendar(Sample.work, { enabled: true })
      })
    )

    test.effect("spans an all-day event from Prague midnight to the next", () =>
      Effect.gen(function* () {
        const calendar = yield* Calendars.Calendar
        const day = Time.addDays(yield* today, 5)
        const holiday = (yield* calendar.events(days(day, 1))).find((event) => event.title === "Holiday")!
        assert.deepStrictEqual(
          [holiday.start, holiday.end, holiday.allDay, holiday.showAs],
          [`${day}T00:00`, `${Time.addDays(day, 1)}T00:00`, true, "free"]
        )
      })
    )

    test.effect("finds the clash between the dentist and an invitation, and the free time around them", () =>
      Effect.gen(function* () {
        const calendar = yield* Calendars.Calendar
        const day = Time.addDays(yield* today, 2)
        const afternoon = { from: Time.PragueLocal.make(`${day}T13:00`), to: Time.PragueLocal.make(`${day}T17:00`) }
        const [clash] = yield* calendar.conflicts(afternoon)
        assert.deepStrictEqual(
          [clash!.first.title, clash!.second.title, clash!.from, clash!.to],
          ["Dentist", "Quarterly review", `${day}T14:30`, `${day}T15:00`]
        )
        assert.deepStrictEqual(clash!.secondFixes, ["Decline it with reply_to_event."])
        assert.deepStrictEqual(
          (yield* calendar.freeTime(afternoon, 30)).map((slot) => [slot.start, slot.end]),
          [
            [`${day}T13:00`, `${day}T14:00`],
            [`${day}T16:00`, `${day}T17:00`]
          ]
        )
      })
    )

    test.effect("refuses a window that ends before it starts, and an event that is not there", () =>
      Effect.gen(function* () {
        const calendar = yield* Calendars.Calendar
        const day = yield* today
        const backwards = yield* Effect.flip(
          calendar.events({ from: Time.PragueLocal.make(`${day}T10:00`), to: Time.PragueLocal.make(`${day}T09:00`) })
        )
        assert.strictEqual(backwards._tag, "Invalid")
        const missing = yield* Effect.flip(calendar.event(Event.EventId.make(`101.${day.replaceAll("-", "")}.nothing`)))
        assert.strictEqual(missing._tag, "NotFound")
      })
    )
  }
)

describe("Reclaim", () => {
  const wire = {
    key: "7/abc",
    calendarId: 7,
    title: "Planning",
    description: "",
    eventDate: { type: "FixedDateTimeRange", start: "2027-03-27T23:30:00Z", end: "2027-03-28T01:30:00Z" },
    status: "CONFIRMED",
    freeBusy: "BUSY",
    rsvpStatus: "NEEDS_ACTION",
    selfOrganized: false,
    canRsvp: true,
    reclaimData: { reclaimEventType: "USER", eventCategory: "WORK" },
    attendeesAndResources: [
      {
        type: "EventAttendeeParticipant",
        email: "a@example.com",
        displayName: "A",
        organizer: true,
        responseStatus: "ACCEPTED"
      },
      { type: "EventResourceParticipant", email: "room@example.com" }
    ]
  }

  it("reads an invitation on the Prague day it starts, with its attendees but not its rooms", () => {
    const entry = Reclaim.entryOf(wire)
    assert.deepStrictEqual(entry.ref, { calendar: 7, date: "2027-03-28", id: "abc" })
    assert.strictEqual(entry.kind, "invitation")
    assert.strictEqual(entry.rsvp, "needsAction")
    assert.isTrue(Option.isNone(entry.notes))
    assert.deepStrictEqual(
      entry.attendees.map((attendee) => attendee.email),
      ["a@example.com"]
    )
  })

  it("reads an all-day range as Prague days, its end the day after the last", () => {
    const entry = Reclaim.entryOf({
      ...wire,
      eventDate: { type: "AllDayDateRange", start: "2027-03-28", end: "2027-03-29" }
    })
    assert.isTrue(entry.allDay)
    assert.strictEqual(DateTime.formatIso(entry.span.start), "2027-03-27T23:00:00.000Z")
    assert.strictEqual(DateTime.formatIso(entry.span.end), "2027-03-28T22:00:00.000Z")
  })

  it("ties a copy Calendar Sync wrote to its original, and reads a habit as Reclaim's own", () => {
    const copy = Reclaim.entryOf({
      ...wire,
      reclaimData: {
        reclaimEventType: "SYNC",
        mergeableEvent: { calendarId: 9, eventId: "orig", referenceType: "SYNC_EVENT" }
      }
    })
    assert.strictEqual(copy.kind, "copy")
    assert.deepStrictEqual(Option.getOrNull(copy.copyOf), { calendar: 9, date: "2027-03-28", id: "orig" })
    assert.strictEqual(
      Reclaim.entryOf({ ...wire, reclaimData: { reclaimEventType: "HABIT_ASSIGNMENT" } }).kind,
      "reclaim"
    )
  })
})

const tables = KernelModule.make({ name: "calendar", migrations: Migrations.migrations })

/** A Reclaim that counts its syncs and calls, holds the events added to it, and is slow or fails while told to. */
const fakeReclaim = Effect.gen(function* () {
  const syncs = yield* Ref.make(0)
  const calls = yield* Ref.make(0)
  const failing = yield* Ref.make(false)
  const slow = yield* Ref.make(false)
  const added = yield* Ref.make<ReadonlyArray<Event.Entry>>([])
  const sample = Sample.make(yield* today)
  const called = Effect.andThen(
    Ref.update(calls, (n) => n + 1),
    Effect.flatMap(Ref.get(failing), (fails) =>
      fails ? Effect.fail(new Errors.SourceFailed({ source: "Reclaim", reason: "down" })) : Effect.void
    )
  )
  const answering = Effect.flatMap(Ref.get(slow), (waits) => (waits ? Effect.sleep("1 second") : Effect.void))
  const reclaim = Reclaim.Reclaim.of({
    ...sample,
    calendars: Effect.andThen(
      Ref.update(syncs, (n) => n + 1),
      Effect.andThen(called, Effect.andThen(answering, sample.calendars))
    ),
    events: (first, end) =>
      Effect.andThen(
        called,
        Effect.flatMap(sample.events(first, end), (found) =>
          Effect.map(Ref.get(added), (extra) => [
            ...found,
            ...Arr.filter(
              extra,
              (entry) =>
                DateTime.isLessThan(entry.span.start, Time.pragueMidnight(end)) &&
                DateTime.isGreaterThan(entry.span.end, Time.pragueMidnight(first))
            )
          ])
        )
      )
  })
  const layer = Calendars.Calendar.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(Reclaim.Reclaim, reclaim),
        Outlook.sample,
        GoogleCalendar.sample,
        BusyTime.BusyTime.none,
        CalendarRepository.CalendarRepository.layer,
        EventCacheRepository.EventCacheRepository.layer,
        DraftRepository.DraftRepository.layer
      )
    ),
    Layer.provideMerge(Testing.layer([tables]))
  )
  return { syncs, calls, failing, slow, added, layer }
})

const planning = (day: Time.PragueDate): Event.Entry => ({
  ref: { calendar: Sample.personal, date: day, id: "planning" },
  title: "Planning",
  span: { start: Time.pragueMidnight(day), end: Time.pragueMidnight(Time.addDays(day, 1)) },
  allDay: true,
  kind: "plain",
  showAs: "busy",
  rsvp: "accepted",
  cancelled: false,
  recurring: false,
  location: Option.none(),
  category: Option.none(),
  notes: Option.none(),
  attendees: [],
  copyOf: Option.none()
})

const holds = (entries: ReadonlyArray<Event.Event>, title: string) => entries.some((event) => event.title === title)

describe("keeps the calendar current", () => {
  it.effect("calls Reclaim not at all while nobody reads", () =>
    Effect.gen(function* () {
      const fake = yield* fakeReclaim
      yield* Effect.gen(function* () {
        yield* Calendars.Calendar
        yield* TestClock.adjust("10 minutes")
      }).pipe(Effect.provide(fake.layer))
      assert.strictEqual(yield* Ref.get(fake.calls), 0)
    })
  )

  it.effect("answers from the cache within two minutes of a sync", () =>
    Effect.gen(function* () {
      const fake = yield* fakeReclaim
      const day = yield* today
      yield* Effect.gen(function* () {
        const calendar = yield* Calendars.Calendar
        yield* calendar.events(days(day, 1))
        const after = yield* Ref.get(fake.calls)
        yield* TestClock.adjust("119 seconds")
        yield* calendar.events(days(day, 1))
        assert.strictEqual(yield* Ref.get(fake.calls), after)
      }).pipe(Effect.provide(fake.layer))
    })
  )

  it.effect("syncs a read more than two minutes after the last sync", () =>
    Effect.gen(function* () {
      const fake = yield* fakeReclaim
      const day = yield* today
      yield* Effect.gen(function* () {
        const calendar = yield* Calendars.Calendar
        yield* calendar.events(days(day, 1))
        yield* Ref.set(fake.added, [planning(day)])
        yield* TestClock.adjust("121 seconds")
        assert.isTrue(holds(yield* calendar.events(days(day, 1)), "Planning"))
        assert.strictEqual(yield* Ref.get(fake.syncs), 2)
      }).pipe(Effect.provide(fake.layer))
    })
  )

  it.effect("syncs every read in the minute after a write, so the write shows once Reclaim has it", () =>
    Effect.gen(function* () {
      const fake = yield* fakeReclaim
      const day = yield* today
      yield* Effect.gen(function* () {
        const calendar = yield* Calendars.Calendar
        yield* calendar.events(days(day, 1))
        yield* calendar.wrote
        yield* TestClock.adjust("10 seconds")
        assert.isFalse(holds(yield* calendar.events(days(day, 1)), "Planning"))
        yield* Ref.set(fake.added, [planning(day)])
        yield* TestClock.adjust("30 seconds")
        assert.isTrue(holds(yield* calendar.events(days(day, 1)), "Planning"))
        assert.strictEqual(yield* Ref.get(fake.syncs), 3)
      }).pipe(Effect.provide(fake.layer))
    })
  )

  it.effect("shares one sync between two reads that arrive together", () =>
    Effect.gen(function* () {
      const fake = yield* fakeReclaim
      const day = yield* today
      yield* Effect.gen(function* () {
        const calendar = yield* Calendars.Calendar
        yield* calendar.events(days(day, 1))
        yield* TestClock.adjust("3 minutes")
        yield* Ref.set(fake.slow, true)
        const reads = yield* Effect.forkChild(
          Effect.all([calendar.events(days(day, 1)), calendar.events(days(day, 1))], { concurrency: 2 })
        )
        yield* TestClock.adjust("1 second")
        yield* Fiber.join(reads)
        assert.strictEqual(yield* Ref.get(fake.syncs), 2)
      }).pipe(Effect.provide(fake.layer))
    })
  )

  it.effect("shows what the cache held when a sync fails, and logs the failure", () =>
    Effect.gen(function* () {
      const fake = yield* fakeReclaim
      const day = yield* today
      const logged: Array<string> = []
      const capture = Logger.layer([
        Logger.make(({ logLevel, message }) => {
          logged.push(`${logLevel} ${String(message)}`)
        })
      ])
      yield* Effect.gen(function* () {
        const calendar = yield* Calendars.Calendar
        const before = yield* calendar.events(days(day, 1))
        yield* Ref.set(fake.failing, true)
        yield* TestClock.adjust("3 minutes")
        assert.deepStrictEqual(yield* calendar.events(days(day, 1)), before)
      }).pipe(Effect.provide(Layer.merge(fake.layer, capture)))
      assert.isTrue(logged.some((line) => line.startsWith("Warn") && line.includes("calendar sync failed")))
    })
  )
})
