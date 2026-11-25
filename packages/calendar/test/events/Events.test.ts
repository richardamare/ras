import { assert, layer } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import * as SqlClient from "effect/sql/SqlClient"
import * as Testing from "@ras/global/testing"
import * as Time from "@ras/kernel/Time"
import * as KernelTesting from "@ras/kernel/Testing"
import * as BusyTime from "../../src/calendars/BusyTime.ts"
import * as Calendars from "../../src/calendars/Calendars.ts"
import * as Event from "../../src/events/Event.ts"
import * as Events from "../../src/events/Events.ts"
import * as Module from "../../src/Module.ts"
import * as GoogleCalendar from "../../src/google/GoogleCalendar.ts"
import * as Outlook from "../../src/outlook/Outlook.ts"
import * as Reclaim from "../../src/reclaim/Reclaim.ts"
import * as Sample from "../../src/reclaim/Sample.ts"

const today = Effect.map(DateTime.now, Time.pragueDateOf)

/** The calls Outlook answered since the last look. */
const calls = Ref.getAndSet(Outlook.sampleCalls, [])

const local = (text: string) => Time.PragueLocal.make(text)

const find = (title: string, day: number) =>
  Effect.gen(function* () {
    const date = Time.addDays(yield* today, day)
    const events = yield* (yield* Calendars.Calendar).events({
      from: local(`${date}T00:00`),
      to: local(`${Time.addDays(date, 1)}T00:00`)
    })
    return events.find((event) => event.title === title)!
  })

layer(Testing.layer([Module.module], { RAS_SAMPLE: "true" }).pipe(Layer.provide(BusyTime.BusyTime.none)))(
  "event writes",
  (test) => {
    test.effect("refuses an event with no calendar named while several take events, and one in another account", () =>
      Effect.gen(function* () {
        const events = yield* Events.Events
        assert.strictEqual(
          yield* KernelTesting.code(events.create({ title: "Call", start: local("2027-01-15T09:00") })),
          "calendar.calendar.choose"
        )
        assert.strictEqual(
          yield* KernelTesting.code(
            events.create({ title: "Call", calendar: Sample.work, start: local("2027-01-15T09:00") })
          ),
          "calendar.calendar.readonly"
        )
        assert.deepStrictEqual(yield* calls, [])
      })
    )

    test.effect("writes a timed event in Prague's clock, an hour long, once however often Graph is retried", () =>
      Effect.gen(function* () {
        const created = yield* (yield* Events.Events).create({
          title: "Call",
          calendar: Sample.personal,
          start: local("2027-01-15T09:00")
        })
        assert.deepStrictEqual(
          [created.calendar, created.start, created.end, created.allDay],
          [Sample.personal, "2027-01-15T09:00", "2027-01-15T10:00", false]
        )
        const [call] = yield* calls
        assert.strictEqual(call!._tag, "Create")
        const write = (call as Extract<Outlook.Call, { _tag: "Create" }>).write
        assert.strictEqual((call as Extract<Outlook.Call, { _tag: "Create" }>).calendar, "sample-personal")
        assert.deepStrictEqual(
          [write.start, write.end, write.isAllDay],
          [
            { dateTime: "2027-01-15T09:00:00", timeZone: "Europe/Prague" },
            { dateTime: "2027-01-15T10:00:00", timeZone: "Europe/Prague" },
            false
          ]
        )
        assert.isString(write.transactionId)
        const sql = yield* SqlClient.SqlClient
        const audit = yield* sql<{
          action: string
        }>`SELECT action FROM global_audit_entries WHERE action LIKE 'calendar.event.%'`
        assert.deepStrictEqual(audit, [{ action: "calendar.event.created" }])
      })
    )

    test.effect("writes an all-day event from Prague midnight to the midnight after its last day", () =>
      Effect.gen(function* () {
        const created = yield* (yield* Events.Events).create({
          title: "Trip",
          calendar: Sample.personal,
          firstDay: Time.PragueDate.make("2027-03-27"),
          lastDay: Time.PragueDate.make("2027-03-28")
        })
        assert.deepStrictEqual(
          [created.start, created.end, created.allDay],
          ["2027-03-27T00:00", "2027-03-29T00:00", true]
        )
        const [call] = yield* calls
        const write = (call as Extract<Outlook.Call, { _tag: "Create" }>).write
        assert.deepStrictEqual(
          [write.start?.dateTime, write.end?.dateTime, write.isAllDay],
          ["2027-03-27T00:00:00", "2027-03-29T00:00:00", true]
        )
      })
    )

    test.effect("writes a weekly series in Prague's clock, so it keeps 09:00 across the spring change", () =>
      Effect.gen(function* () {
        yield* (yield* Events.Events).create({
          title: "Lesson",
          calendar: Sample.personal,
          start: local("2027-03-22T09:00"),
          end: local("2027-03-22T10:00"),
          repeat: { every: "week", count: 4 }
        })
        const [call] = yield* calls
        const write = (call as Extract<Outlook.Call, { _tag: "Create" }>).write
        assert.deepStrictEqual(write.start, { dateTime: "2027-03-22T09:00:00", timeZone: "Europe/Prague" })
        assert.deepStrictEqual(write.recurrence, {
          pattern: { type: "weekly", interval: 1, daysOfWeek: ["monday"], firstDayOfWeek: "monday" },
          range: {
            type: "numbered",
            startDate: "2027-03-22",
            numberOfOccurrences: 4,
            recurrenceTimeZone: "Europe/Prague"
          }
        })
      })
    )

    test.effect(
      "refuses a time that does not exist, an end before the start, and a weekly repeat that skips its first day",
      () =>
        Effect.gen(function* () {
          const events = yield* Events.Events
          assert.strictEqual(
            yield* KernelTesting.code(events.create({ title: "x", start: local("2027-03-28T02:30") })),
            "Invalid"
          )
          assert.strictEqual(
            yield* KernelTesting.code(
              events.create({ title: "x", start: local("2027-01-15T10:00"), end: local("2027-01-15T09:00") })
            ),
            "Invalid"
          )
          assert.strictEqual(
            yield* KernelTesting.code(
              events.create({
                title: "x",
                start: local("2027-03-22T09:00"),
                repeat: { every: "week", on: ["tuesday"] }
              })
            ),
            "Invalid"
          )
          assert.deepStrictEqual(yield* calls, [])
        })
    )

    test.effect("changes the dentist's show-as, and moves it keeping its length", () =>
      Effect.gen(function* () {
        const events = yield* Events.Events
        const dentist = yield* find("Dentist", 2)
        const freed = yield* events.change(dentist.id, { showAs: "free" })
        assert.strictEqual(freed.showAs, "free")
        const day = dentist.start.slice(0, 10)
        const moved = yield* events.change(dentist.id, { start: local(`${day}T16:30`) })
        assert.deepStrictEqual([moved.start, moved.end], [`${day}T16:30`, `${day}T17:30`])
        const [show, move] = yield* calls
        assert.deepStrictEqual(show, { _tag: "Change", event: "graph-dentist", write: { showAs: "free" } })
        assert.deepStrictEqual((move as Extract<Outlook.Call, { _tag: "Change" }>).write.end, {
          dateTime: `${day}T17:30:00`,
          timeZone: "Europe/Prague"
        })
      })
    )

    test.effect("cancels one occurrence of a series alone", () =>
      Effect.gen(function* () {
        const gym = yield* find("Gym", 3)
        yield* (yield* Events.Events).cancel(gym.id)
        assert.deepStrictEqual(yield* calls, [
          { _tag: "Occurrence", series: "graph-gym", start: gym.start },
          { _tag: "Cancel", event: `graph-gym@${gym.start}` }
        ])
      })
    )

    test.effect(
      "refuses a change to another account's event, a copy and Reclaim's habit, and a reply to a plain event",
      () =>
        Effect.gen(function* () {
          const events = yield* Events.Events
          const standup = yield* find("Standup", 0)
          assert.strictEqual(
            yield* KernelTesting.code(events.change(standup.id, { title: "Sync" })),
            "calendar.event.readonly"
          )
          yield* (yield* Calendars.Calendar).changeCalendar(Sample.work, { enabled: false })
          const copy = yield* find("Standup", 0)
          assert.strictEqual(yield* KernelTesting.code(events.cancel(copy.id)), "calendar.event.copy")
          assert.strictEqual(
            yield* KernelTesting.code(events.change(standup.id, { title: "Sync" })),
            "calendar.calendar.off"
          )
          yield* (yield* Calendars.Calendar).changeCalendar(Sample.work, { enabled: true })
          assert.strictEqual(
            yield* KernelTesting.code(events.change((yield* find("Lunch", 0)).id, { title: "Lunch" })),
            "calendar.event.reclaim"
          )
          assert.strictEqual(
            yield* KernelTesting.code(events.reply((yield* find("Dentist", 2)).id, "accept")),
            "calendar.event.not-invitation"
          )
          assert.deepStrictEqual(yield* calls, [])
        })
    )

    test.effect("replies to an invitation in the work calendar and audits the answer", () =>
      Effect.gen(function* () {
        const review = yield* find("Quarterly review", 2)
        yield* (yield* Events.Events).reply(review.id, "decline")
        const sql = yield* SqlClient.SqlClient
        const audit = yield* sql<{ before: string; after: string }>`
        SELECT before, after FROM global_audit_entries WHERE action = 'calendar.event.replied'`
        assert.deepStrictEqual(audit, [{ before: '{"rsvp":"needsAction"}', after: '{"rsvp":"declined"}' }])
      })
    )

    test.effect(
      "writes a work block's event busy, its notes carrying the block's marker, and shows the event as the block's",
      () =>
        Effect.gen(function* () {
          const events = yield* Events.Events
          const block = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"
          const span = {
            start: yield* Time.toInstant(local("2027-01-15T09:00")),
            end: yield* Time.toInstant(local("2027-01-15T10:30"))
          }
          const id = yield* events.placeBlock(Sample.personal, { id: block, title: "ras: Plan the week", span })
          const [placed] = yield* calls
          const write = (placed as Extract<Outlook.Call, { _tag: "Create" }>).write
          assert.deepStrictEqual(
            [write.subject, write.body?.content, write.showAs, write.transactionId],
            ["ras: Plan the week", `ras-block:${block}`, "busy", block]
          )
          yield* events.moveBlock(Sample.personal, id, { id: block, title: "ras: Plan the week", span })
          yield* events.removeBlock(Sample.personal, id)
          assert.deepStrictEqual(
            (yield* calls).map((call) => call._tag),
            ["Change", "Cancel"]
          )
          assert.strictEqual(
            yield* KernelTesting.code(events.placeBlock(Sample.work, { id: block, title: "x", span })),
            "calendar.calendar.readonly"
          )
          const entry = Reclaim.entryOf({
            key: "101/e",
            calendarId: 101,
            title: "ras: Plan the week",
            description: `Bring the list.\n\nras-block:${block}`,
            eventDate: { type: "FixedDateTimeRange", start: "2027-01-15T08:00:00Z", end: "2027-01-15T09:30:00Z" },
            status: "CONFIRMED",
            freeBusy: "BUSY",
            selfOrganized: true,
            canRsvp: false,
            reclaimData: { reclaimEventType: "USER" }
          })
          const shown = Event.eventOf(entry)
          assert.deepStrictEqual([shown.block, shown.notes], [block, "Bring the list."])
        })
    )

    test.effect("writes an event, a change and a block into a Google calendar through the Calendar API", () =>
      Effect.gen(function* () {
        const events = yield* Events.Events
        yield* Ref.set(GoogleCalendar.sampleCalls, [])
        const created = yield* events.create({
          title: "Swim",
          calendar: Sample.family,
          start: local("2027-01-15T17:00"),
          showAs: "free",
          repeat: { every: "week", count: 4 }
        })
        assert.strictEqual(created.calendar, Sample.family)
        const run = yield* find("School run", 4)
        yield* events.change(run.id, { start: local(`${Time.addDays(yield* today, 4)}T07:45`) })
        const block = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"
        const span = {
          start: yield* Time.toInstant(local("2027-01-16T09:00")),
          end: yield* Time.toInstant(local("2027-01-16T10:00"))
        }
        const id = yield* events.placeBlock(Sample.family, { id: block, title: "ras: Plan the week", span })
        yield* events.removeBlock(Sample.family, id)
        const [insert, patch, placed, remove, ...rest] = yield* Ref.getAndSet(GoogleCalendar.sampleCalls, [])
        assert.deepStrictEqual(rest, [])
        assert.deepStrictEqual(yield* calls, [])
        assert.deepStrictEqual(insert, {
          _tag: "Insert",
          calendar: "family@group.calendar.google.com",
          body: {
            summary: "Swim",
            transparency: "transparent",
            start: { dateTime: "2027-01-15T17:00:00", timeZone: "Europe/Prague" },
            end: { dateTime: "2027-01-15T18:00:00", timeZone: "Europe/Prague" },
            recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=FR;COUNT=4"],
            id: (insert as Extract<GoogleCalendar.Call, { _tag: "Insert" }>).body.id!
          }
        })
        assert.match((insert as Extract<GoogleCalendar.Call, { _tag: "Insert" }>).body.id!, /^[a-v0-9]{32}$/)
        assert.deepStrictEqual(
          [patch?._tag, (patch as Extract<GoogleCalendar.Call, { _tag: "Patch" }>).event],
          ["Patch", "school-run"]
        )
        const write = (placed as Extract<GoogleCalendar.Call, { _tag: "Insert" }>).body
        assert.deepStrictEqual(
          [write.summary, write.description, write.transparency, write.id],
          ["ras: Plan the week", `ras-block:${block}`, "opaque", block.replaceAll("-", "")]
        )
        assert.deepStrictEqual(remove, {
          _tag: "Remove",
          calendar: "family@group.calendar.google.com",
          event: block.replaceAll("-", "")
        })
      })
    )
  }
)
