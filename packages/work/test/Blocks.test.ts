import { assert, layer } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import * as Result from "effect/Result"
import * as SqlClient from "effect/sql/SqlClient"
import * as TestClock from "effect/testing/TestClock"
import * as Calendar from "@ras/calendar"
import * as CalendarTesting from "@ras/calendar/testing"
import * as Global from "@ras/global"
import * as Testing from "@ras/global/testing"
import * as Time from "@ras/kernel/Time"
import * as Blocks from "../src/Blocks.ts"
import * as Board from "../src/Board.ts"
import * as Module from "../src/Module.ts"

const code = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.map(Effect.flip(effect), (error) => ("code" in error ? String(error.code) : error._tag))

const calls = Ref.getAndSet(CalendarTesting.sampleCalls, [])

/** A Prague local time `hours` after now. */
const inHours = (hours: number) =>
  Effect.map(DateTime.now, (now) => Time.toPragueLocal(DateTime.add(now, { minutes: Math.round(hours * 60) })))

/** The owner's personal space writes to the sample's personal calendar; one project, one task in it. */
const setUp = Effect.gen(function* () {
  const board = yield* Board.Board
  const [space] = yield* board.spaces
  yield* board.changeSpace(space!.id, { calendar: CalendarTesting.personal })
  const project = yield* board.addProject({ name: "ras" })
  const task = yield* board.addTask({ title: "Plan the week", project: project.id })
  yield* Ref.set(CalendarTesting.sampleCalls, [])
  return { board, task, project, space: space! }
})

layer(Testing.layer([CalendarTesting.module, Module.module], CalendarTesting.sample))("work blocks", (test) => {
  test.effect("plans a block into its space's calendar, titled with the project and the task", () =>
    Effect.gen(function* () {
      const { task } = yield* setUp
      const blocks = yield* Blocks.Blocks
      const block = yield* blocks.plan({ task: task.id, start: yield* inHours(2), minutes: 90 })
      assert.deepStrictEqual(
        [block.title, block.state, block.calendar],
        ["ras: Plan the week", "planned", CalendarTesting.personal]
      )
      const [call] = yield* calls
      assert.strictEqual(call!._tag, "Create")
      const create = call as Extract<typeof call, { _tag: "Create" }>
      assert.deepStrictEqual(
        [create.calendar, create.write.subject, create.write.body?.content],
        ["sample-personal", "ras: Plan the week", `ras-block:${block.id}`]
      )
      assert.strictEqual(
        yield* code(blocks.plan({ task: task.id, start: yield* inHours(2.5), minutes: 30 })),
        "work.block.overlap"
      )
      assert.strictEqual(
        yield* code(blocks.plan({ task: task.id, start: yield* inHours(-1), minutes: 30 })),
        "work.block.past"
      )
      yield* blocks.remove(block.id)
      assert.deepStrictEqual(
        (yield* calls).map((one) => one._tag),
        ["Cancel"]
      )
    })
  )

  test.effect("starts a block now and stops it at the real time, with its event", () =>
    Effect.gen(function* () {
      const { task } = yield* setUp
      const blocks = yield* Blocks.Blocks
      const started = yield* blocks.start(task.id)
      assert.deepStrictEqual([started.state, started.end], ["running", null])
      assert.strictEqual(yield* code(blocks.start(task.id)), "work.block.running")
      assert.strictEqual(yield* code(blocks.remove(started.id)), "work.block.running")
      yield* TestClock.adjust("50 minutes")
      const stopped = yield* blocks.stop
      assert.strictEqual(stopped.state, "done")
      assert.strictEqual(stopped.end, yield* inHours(0))
      const [, move] = yield* calls
      const change = move as Extract<typeof move, { _tag: "Change" }>
      assert.strictEqual(change.write.end?.dateTime, `${stopped.end}:00`)
      assert.strictEqual(yield* code(blocks.stop), "work.block.idle")
      const sql = yield* SqlClient.SqlClient
      const audit = yield* sql<{ action: string }>`
        SELECT action FROM global_audit_entries WHERE action LIKE 'work.block.%' ORDER BY id`
      assert.deepStrictEqual(audit.map((entry) => entry.action).slice(-2), ["work.block.started", "work.block.stopped"])
    })
  )

  test.effect("logs work that already happened, and refuses an end still to come", () =>
    Effect.gen(function* () {
      const { task } = yield* setUp
      const blocks = yield* Blocks.Blocks
      yield* TestClock.adjust("3 hours")
      const logged = yield* blocks.log({ task: task.id, end: yield* inHours(-0.5), minutes: 45 })
      assert.strictEqual(logged.state, "done")
      assert.strictEqual(
        yield* code(blocks.log({ task: task.id, end: yield* inHours(1), minutes: 30 })),
        "work.block.future"
      )
    })
  )

  test.effect("keeps a draft in ras, taking its time in the calendar, until it is confirmed", () =>
    Effect.gen(function* () {
      const { task } = yield* setUp
      const blocks = yield* Blocks.Blocks
      const start = yield* inHours(5)
      const draft = yield* blocks.plan({ task: task.id, start, minutes: 60, draft: true })
      assert.strictEqual(draft.state, "draft")
      assert.deepStrictEqual(yield* calls, [])
      const calendar = yield* Calendar.Calendar
      const window = { from: start, to: yield* inHours(6) }
      const [shown] = yield* calendar.events(window)
      assert.deepStrictEqual([shown!.block, shown!.draft], [draft.id, { refusal: null }])
      assert.deepStrictEqual(yield* calendar.freeTime(window, 5), [])
      const confirmed = yield* blocks.confirm(draft.id)
      assert.strictEqual(confirmed.state, "planned")
      assert.deepStrictEqual(
        (yield* calls).map((one) => one._tag),
        ["Create"]
      )
      const moved = yield* blocks.move({ block: draft.id, start: yield* inHours(7), end: yield* inHours(7.5) })
      assert.strictEqual(moved.start, yield* inHours(7))
      assert.deepStrictEqual(
        (yield* calls).map((one) => one._tag),
        ["Change"]
      )
    })
  )

  test.effect("plans no block on an agent's task, on a done one, or in a space without a calendar", () =>
    Effect.gen(function* () {
      const { board, space } = yield* setUp
      const blocks = yield* Blocks.Blocks
      const scheduler = Global.AgentSlug.make("scheduler")
      yield* (yield* Global.Agents).add(scheduler, "Scheduler")
      const theirs = yield* board.addTask({ title: "Book the dentist", assignee: scheduler })
      assert.strictEqual(
        yield* code(blocks.plan({ task: theirs.id, start: yield* inHours(9), minutes: 30 })),
        "work.block.agent"
      )
      const done = yield* board.addTask({ title: "Done already", status: "done" })
      assert.strictEqual(yield* code(blocks.start(done.id)), "work.block.done")
      const other = yield* board.addSpace({ name: "School", color: "#00cc6a" })
      const elsewhere = yield* board.addTask({ title: "Essay", space: other.id })
      assert.strictEqual(yield* code(blocks.start(elsewhere.id)), "work.block.calendar")
      assert.isDefined(space)
    })
  )

  test.effect("closes a task without its unstarted blocks, and keeps the time spent on it", () =>
    Effect.gen(function* () {
      const { board, task, project } = yield* setUp
      const blocks = yield* Blocks.Blocks
      yield* blocks.log({ task: task.id, end: yield* inHours(-30), minutes: 45 })
      yield* blocks.plan({ task: task.id, start: yield* inHours(40), minutes: 30 })
      yield* blocks.plan({ task: task.id, start: yield* inHours(42), minutes: 30, draft: true })
      yield* Ref.set(CalendarTesting.sampleCalls, [])
      const closed = yield* board.changeTask(task.id, { status: "done" })
      assert.deepStrictEqual([closed.status, closed.spent], ["done", 45])
      assert.strictEqual((yield* board.project(project.id)).spent, 45)
      assert.deepStrictEqual(
        (yield* calls).map((one) => one._tag),
        ["Cancel"]
      )
      const left = yield* blocks.blocks({ from: yield* inHours(-31), to: yield* inHours(43) })
      assert.deepStrictEqual(
        left.filter((one) => one.task === task.id).map((one) => one.state),
        ["done"]
      )
    })
  )

  test.effect("deletes a task with its planned blocks, and closes one with work logged instead", () =>
    Effect.gen(function* () {
      const { board, task } = yield* setUp
      const blocks = yield* Blocks.Blocks
      yield* blocks.plan({ task: task.id, start: yield* inHours(44), minutes: 30 })
      yield* Ref.set(CalendarTesting.sampleCalls, [])
      assert.isTrue(Option.isNone(yield* board.deleteTask(task.id)))
      assert.strictEqual(yield* code(board.task(task.id)), "NotFound")
      assert.deepStrictEqual(
        (yield* calls).map((one) => one._tag),
        ["Cancel"]
      )

      const worked = yield* board.addTask({ title: "Read the contract" })
      yield* blocks.log({ task: worked.id, end: yield* inHours(-34), minutes: 20 })
      const kept = yield* board.deleteTask(worked.id)
      assert.deepStrictEqual(
        Option.map(kept, (found) => [found.status, found.spent]),
        Option.some(["done", 20])
      )
    })
  )

  test.effect("refuses the second of two parallel plans for the same time", () =>
    Effect.gen(function* () {
      const { task } = yield* setUp
      const blocks = yield* Blocks.Blocks
      const start = yield* inHours(60)
      const outcomes = yield* Effect.all(
        [
          Effect.result(blocks.plan({ task: task.id, start, minutes: 60 })),
          Effect.result(blocks.plan({ task: task.id, start, minutes: 60 }))
        ],
        { concurrency: "unbounded" }
      )
      assert.strictEqual(outcomes.filter(Result.isSuccess).length, 1)
      const [refused] = outcomes.filter(Result.isFailure)
      assert.strictEqual(
        "code" in refused!.failure ? refused!.failure.code : refused!.failure._tag,
        "work.block.overlap"
      )
    })
  )

  test.effect("starts only one of two parallel starts", () =>
    Effect.gen(function* () {
      const { task } = yield* setUp
      const blocks = yield* Blocks.Blocks
      yield* Effect.ignore(blocks.stop)
      yield* calls
      const outcomes = yield* Effect.all([Effect.result(blocks.start(task.id)), Effect.result(blocks.start(task.id))], {
        concurrency: "unbounded"
      })
      assert.strictEqual(outcomes.filter(Result.isSuccess).length, 1)
      const [refused] = outcomes.filter(Result.isFailure)
      assert.strictEqual(
        "code" in refused!.failure ? refused!.failure.code : refused!.failure._tag,
        "work.block.running"
      )
      assert.deepStrictEqual(
        (yield* calls).map((one) => one._tag),
        ["Create"]
      )
      yield* blocks.stop
    })
  )
})
