import { assert, layer } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"
import * as Calendar from "@ras/calendar"
import * as CalendarTesting from "@ras/calendar/testing"
import * as Testing from "@ras/global/testing"
import * as Time from "@ras/kernel/Time"
import * as Blocks from "../src/Blocks.ts"
import * as Board from "../src/Board.ts"
import * as Drafts from "../src/Drafts.ts"
import * as Module from "../src/Module.ts"

const inHours = (hours: number) => Effect.map(DateTime.now, (now) => Time.toPragueLocal(DateTime.add(now, { hours })))

const day = (local: Time.PragueLocal) => Time.PragueDate.make(local.slice(0, 10))

/** A block draft and an event draft a day apart, and one more event draft beside the first. */
const setUp = Effect.gen(function* () {
  const board = yield* Board.Board
  const [space] = yield* board.spaces
  yield* board.changeSpace(space!.id, { calendar: CalendarTesting.personal })
  const task = yield* board.addTask({ title: "Write the report" })
  const events = yield* Calendar.Events
  const start = yield* inHours(26)
  const block = yield* (yield* Blocks.Blocks).plan({ task: task.id, start, minutes: 60, draft: true })
  const call = yield* events.create({
    title: "Call",
    calendar: CalendarTesting.personal,
    start: yield* inHours(28),
    draft: true
  })
  const later = yield* events.create({
    title: "Dinner",
    calendar: CalendarTesting.personal,
    start: yield* inHours(50),
    draft: true
  })
  yield* Ref.set(CalendarTesting.sampleCalls, [])
  return { block, call: call.draft!, later: later.draft!, day: day(start) }
})

const creates = Effect.map(Ref.getAndSet(CalendarTesting.sampleCalls, []), (calls) =>
  calls.flatMap((call) => (call._tag === "Create" ? [call.write.subject] : []))
)

layer(Testing.layer([CalendarTesting.module, Module.module], CalendarTesting.sample))("drafts", (test) => {
  test.effect("confirms a day's block and event drafts together and leaves the other days' drafts", () =>
    Effect.gen(function* () {
      const { day } = yield* setUp
      const drafts = yield* Drafts.Drafts
      const result = yield* drafts.confirm({ day })
      assert.deepStrictEqual(
        [result.confirmed.map((each) => each.title), result.refused],
        [["Write the report", "Call"], []]
      )
      assert.deepStrictEqual(yield* creates, ["Write the report", "Call"])
      const [block] = yield* (yield* Blocks.Blocks).blocks({ from: yield* inHours(25), to: yield* inHours(27) })
      assert.strictEqual(block!.state, "planned")
      yield* (yield* Blocks.Blocks).remove(block!.id)
      assert.strictEqual(yield* drafts.discard, 1)
    })
  )

  test.effect("confirms the drafts it is given by id, and discards the rest of both kinds", () =>
    Effect.gen(function* () {
      const { block, later } = yield* setUp
      const drafts = yield* Drafts.Drafts
      const result = yield* drafts.confirm({ drafts: [later] })
      assert.deepStrictEqual(
        result.confirmed.map((each) => each.id),
        [later]
      )
      assert.strictEqual(yield* drafts.discard, 2)
      assert.deepStrictEqual(yield* (yield* Calendar.Events).drafts, [])
      assert.strictEqual(
        (yield* (yield* Blocks.Blocks).blocks({ from: yield* inHours(25), to: yield* inHours(27) })).some(
          (each) => each.id === block.id
        ),
        false
      )
    })
  )

  test.effect("refuses an id that is no draft, and both ids and a day", () =>
    Effect.gen(function* () {
      const { call, day } = yield* setUp
      const drafts = yield* Drafts.Drafts
      const unknown = yield* Effect.flip(drafts.confirm({ drafts: [call, "nothing"] }))
      assert.include(unknown.message, "Not a draft: nothing.")
      const both = yield* Effect.flip(drafts.confirm({ drafts: [call], day }))
      assert.strictEqual(both.message, "Name the drafts or a day, not both.")
      assert.deepStrictEqual(yield* creates, [])
      assert.strictEqual(yield* drafts.discard, 3)
    })
  )

  test.effect("keeps a draft its calendar refuses, and says why", () =>
    Effect.gen(function* () {
      const { day } = yield* setUp
      yield* (yield* Calendar.Calendar).changeCalendar(CalendarTesting.personal, { enabled: false })
      const result = yield* (yield* Drafts.Drafts).confirm({ day })
      assert.deepStrictEqual([result.confirmed, result.refused.length], [[], 2])
      assert.include(result.refused[0]!.refusal!, "turned off")
      yield* (yield* Calendar.Calendar).changeCalendar(CalendarTesting.personal, { enabled: true })
      assert.strictEqual(yield* (yield* Drafts.Drafts).discard, 3)
    })
  )
})
