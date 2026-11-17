import { assert, describe, it, layer } from "@effect/vitest"
import * as Arr from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import * as SqlClient from "effect/sql/SqlClient"
import * as TestClock from "effect/testing/TestClock"
import * as Testing from "@ras/global/testing"
import * as KernelModule from "@ras/kernel/Module"
import * as Time from "@ras/kernel/Time"
import * as BusyTime from "../../src/calendars/BusyTime.ts"
import * as Calendars from "../../src/calendars/Calendars.ts"
import * as CalendarRepository from "../../src/calendars/CalendarRepository.ts"
import * as Span from "../../src/calendars/Span.ts"
import * as Event from "../../src/events/Event.ts"
import * as DraftRepository from "../../src/events/DraftRepository.ts"
import * as EventCacheRepository from "../../src/calendars/EventCacheRepository.ts"
import * as Migrations from "../../src/Migrations.ts"
import * as Module from "../../src/Module.ts"
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
    test.effect("lists every connected calendar, writable in the connected account, and audits turning one off", () =>
      Effect.gen(function* () {
        const calendar = yield* Calendars.Calendar
        const listed = yield* calendar.calendars(false)
        assert.deepStrictEqual(
          listed.map((found) => [found.name, found.writable, found.enabled]),
          [
            ["Personal", true, true],
            ["Work (copy)", true, true],
            ["Work", false, true]
          ]
        )
        const changed = yield* calendar.changeCalendar(Sample.work, { enabled: false })
        assert.strictEqual(changed.enabled, false)
        assert.deepStrictEqual(
          (yield* calendar.calendars(false)).map((found) => found.name),
          ["Personal", "Work (copy)"]
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
          ["Personal", "Work (copy)"]
        )
        assert.strictEqual((yield* calendar.calendars(true)).length, 3)
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

describe("refreshes after writes", () => {
  it.effect("shares one pending sync between the refreshes of a burst", () =>
    Effect.gen(function* () {
      const syncs = yield* Ref.make(0)
      const sample = Sample.make(yield* today)
      const counting = Layer.succeed(
        Reclaim.Reclaim,
        Reclaim.Reclaim.of({
          ...sample,
          calendars: Effect.andThen(
            Ref.update(syncs, (n) => n + 1),
            sample.calendars
          )
        })
      )
      const calendarLayer = Layer.effect(Calendars.Calendar, Calendars.Calendar.make).pipe(
        Layer.provide(
          Layer.mergeAll(
            counting,
            Outlook.sample,
            BusyTime.BusyTime.none,
            CalendarRepository.CalendarRepository.layer,
            EventCacheRepository.EventCacheRepository.layer,
            DraftRepository.DraftRepository.layer
          )
        ),
        Layer.provideMerge(Testing.layer([tables]))
      )
      const [soon, later] = yield* Effect.gen(function* () {
        const calendar = yield* Calendars.Calendar
        yield* Effect.forEach(Arr.range(1, 10), () => calendar.refresh, { discard: true })
        yield* TestClock.adjust("1 second")
        const soon = yield* Ref.get(syncs)
        yield* TestClock.adjust("1 minute")
        return [soon, yield* Ref.get(syncs)] as const
      }).pipe(Effect.provide(calendarLayer))
      assert.isAtLeast(soon, 1)
      assert.isAtMost(soon, 2)
      assert.isAtMost(later, 4)
    })
  )
})
