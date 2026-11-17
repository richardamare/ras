import { assert, layer } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import * as SqlClient from "effect/sql/SqlClient"
import * as Testing from "@ras/global/testing"
import * as Time from "@ras/kernel/Time"
import * as BusyTime from "../src/BusyTime.ts"
import * as Calendar from "../src/Calendar.ts"
import * as Domain from "../src/Domain.ts"
import * as Events from "../src/Events.ts"
import * as Module from "../src/Module.ts"
import * as Outlook from "../src/Outlook.ts"
import * as Sample from "../src/Sample.ts"

const local = (text: string) => Time.PragueLocal.make(text)
const calls = Ref.getAndSet(Outlook.sampleCalls, [])
const morning = { from: local("2027-01-15T08:00"), to: local("2027-01-15T12:00") }

const code = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.map(Effect.flip(effect), (error) => ("code" in error ? String(error.code) : error._tag))

layer(Testing.layer([Module.module], { RAS_SAMPLE: "true" }).pipe(Layer.provide(BusyTime.BusyTime.none)))(
  "event drafts",
  (test) => {
    test.effect("keeps a draft in ras, shown as a draft and taking its time, and writes nothing to Outlook", () =>
      Effect.gen(function* () {
        const calendar = yield* Calendar.Calendar
        yield* Ref.set(Outlook.sampleCalls, [])
        const created = yield* (yield* Events.Events).create({
          title: "Focus",
          calendar: Sample.personal,
          start: local("2027-01-15T09:00"),
          draft: true
        })
        assert.isNotNull(created.draft)
        const [draft] = yield* calendar.events(morning)
        assert.deepStrictEqual([draft!.id, draft!.title, draft!.draft], [created.draft, "Focus", { refusal: null }])
        assert.deepStrictEqual(
          (yield* calendar.freeTime(morning, 30)).map((slot) => [slot.start, slot.end]),
          [
            ["2027-01-15T08:00", "2027-01-15T09:00"],
            ["2027-01-15T10:00", "2027-01-15T12:00"]
          ]
        )
        assert.deepStrictEqual(yield* calls, [])
      })
    )

    test.effect("refuses a repeating draft", () =>
      Effect.gen(function* () {
        const refused = yield* code(
          (yield* Events.Events).create({
            title: "x",
            calendar: Sample.personal,
            start: local("2027-01-15T09:00"),
            draft: true,
            repeat: { every: "day" }
          })
        )
        assert.strictEqual(refused, "Invalid")
      })
    )

    test.effect("moves a draft in ras, and confirms it into Outlook through the same path as a new event", () =>
      Effect.gen(function* () {
        const calendar = yield* Calendar.Calendar
        const events = yield* Events.Events
        const [draft] = yield* calendar.events(morning)
        const moved = yield* events.change(draft!.id, { start: local("2027-01-15T10:30") })
        assert.deepStrictEqual([moved.start, moved.end], ["2027-01-15T10:30", "2027-01-15T11:30"])
        assert.deepStrictEqual(yield* calls, [])
        const confirmed = yield* events.confirm(moved.id)
        assert.deepStrictEqual([confirmed.start, confirmed.draft], ["2027-01-15T10:30", null])
        const [call] = yield* calls
        assert.strictEqual(call!._tag, "Create")
        assert.deepStrictEqual(yield* calendar.events(morning), [])
        const sql = yield* SqlClient.SqlClient
        const audit = yield* sql<{ action: string }>`
        SELECT action FROM global_audit_entries WHERE action LIKE 'calendar.draft.%' OR action LIKE 'calendar.event.%'
        ORDER BY id`
        assert.deepStrictEqual(
          audit.map((entry) => entry.action),
          ["calendar.draft.created", "calendar.draft.changed", "calendar.event.created", "calendar.draft.confirmed"]
        )
      })
    )

    test.effect("keeps a draft its calendar refuses, with the reason, and discards it on cancel", () =>
      Effect.gen(function* () {
        const calendar = yield* Calendar.Calendar
        const events = yield* Events.Events
        const created = yield* events.create({
          title: "Review",
          calendar: Sample.personal,
          start: local("2027-01-15T09:00"),
          draft: true
        })
        yield* calendar.changeCalendar(Sample.personal, { enabled: false })
        assert.strictEqual(yield* code(events.confirm(created.draft!)), "calendar.calendar.off")
        yield* calendar.changeCalendar(Sample.personal, { enabled: true })
        const [kept] = yield* calendar.events(morning)
        assert.include(kept!.draft!.refusal!, "is turned off in ras")
        yield* events.cancel(kept!.id)
        assert.deepStrictEqual(yield* calendar.events(morning), [])
        assert.deepStrictEqual(yield* calls, [])
        assert.strictEqual(yield* code(events.confirm(Domain.EventId.make(kept!.id))), "NotFound")
      })
    )
  }
)

const planned = BusyTime.BusyTime.of({
  drafts: (span) =>
    Effect.map(Effect.orDie(Time.toInstant(local("2027-01-15T09:00"))), (start) =>
      DateTime.isLessThan(start, span.end) && DateTime.isGreaterThan(DateTime.add(start, { hours: 1 }), span.start)
        ? [
            {
              id: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
              calendar: Sample.personal,
              title: "ras: Plan the week",
              span: { start, end: DateTime.add(start, { hours: 1 }) }
            }
          ]
        : []
    )
})

layer(
  Testing.layer([Module.module], { RAS_SAMPLE: "true" }).pipe(Layer.provide(Layer.succeed(BusyTime.BusyTime, planned)))
)("block drafts", (test) => {
  test.effect("shows a block draft as the block's, takes its time, and leaves its writes to the block", () =>
    Effect.gen(function* () {
      const calendar = yield* Calendar.Calendar
      const [block] = yield* calendar.events(morning)
      assert.deepStrictEqual(
        [block!.title, block!.block, block!.draft],
        ["ras: Plan the week", "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b", { refusal: null }]
      )
      assert.deepStrictEqual(
        (yield* calendar.freeTime(morning, 30)).map((slot) => slot.start),
        ["2027-01-15T08:00", "2027-01-15T10:00"]
      )
      const events = yield* Events.Events
      assert.strictEqual(yield* code(events.change(block!.id, { title: "x" })), "calendar.event.block")
      assert.strictEqual(yield* code(events.confirm(block!.id)), "calendar.event.block")
    })
  )
})
