import { assert, layer } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as TestClock from "effect/testing/TestClock"
import * as Global from "@ras/global"
import * as Testing from "@ras/global/testing"
import * as Time from "@ras/kernel/Time"
import * as Board from "../src/Board.ts"
import * as Module from "../src/Module.ts"

const kalendarnik = Global.AgentSlug.make("kalendarnik")
const ghost = Global.AgentSlug.make("ghost")

const code = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.map(Effect.flip(effect), (error) => ("code" in error ? String(error.code) : error._tag))

/** Runs `effect` as the agent, as a writing tool that names it does. */
const asAgent = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.flatMap(Global.actingAs, (actingAs) => actingAs(kalendarnik)(effect))

layer(Testing.layer([Module.module]))("the board", (test) => {
  test.effect("hands a task to an agent's poll, and back to the owner in review with the agent's comment", () =>
    Effect.gen(function* () {
      const board = yield* Board.Board
      yield* (yield* Global.Agents).add(kalendarnik, "Kalendářník")
      yield* board.addTask({ title: "Seen in an earlier poll", assignee: kalendarnik })
      yield* TestClock.adjust("1 hour")
      const since = Time.toPragueLocal(yield* DateTime.now)
      const task = yield* board.addTask({ title: "Book the dentist", assignee: kalendarnik, body: "Any morning." })
      assert.strictEqual(task.status, "todo")

      const polled = yield* board.tasks({ assignee: kalendarnik, status: "todo", updatedSince: since })
      assert.deepStrictEqual(
        polled.map((found) => found.id),
        [task.id]
      )

      assert.strictEqual(yield* code(asAgent(board.changeTask(task.id, { status: "review" }))), "work.task.comment")
      const reviewed = yield* asAgent(
        board.changeTask(task.id, { status: "review", comment: "Booked Tuesday 9:00. Check it fits." })
      )
      assert.strictEqual(reviewed.status, "review")
      assert.deepStrictEqual(
        reviewed.comments.map((comment) => [comment.author, comment.text]),
        [["kalendarnik", "Booked Tuesday 9:00. Check it fits."]]
      )
      const waiting = yield* board.tasks({ status: "review" })
      assert.deepStrictEqual(
        waiting.map((found) => found.id),
        [task.id]
      )
    })
  )

  test.effect("puts work an agent proposes on its own in the inbox, and keeps the brief the owner's", () =>
    Effect.gen(function* () {
      const board = yield* Board.Board
      const proposed = yield* asAgent(board.addTask({ title: "Renew the domain", body: "It expires in December." }))
      assert.strictEqual(proposed.status, "inbox")
      assert.strictEqual(yield* code(asAgent(board.changeTask(proposed.id, { body: "Rewritten." }))), "work.task.body")
      const commented = yield* asAgent(board.comment(proposed.id, { text: "Found the registrar." }))
      assert.strictEqual(commented.body, "It expires in December.")
      assert.strictEqual(commented.comments.length, 1)
    })
  )

  test.effect("closes a task on done, keeps the time it closed, and reopens it with its log", () =>
    Effect.gen(function* () {
      const board = yield* Board.Board
      const task = yield* board.addTask({ title: "Pay the invoice" })
      const done = yield* board.changeTask(task.id, { status: "done" })
      assert.isNotNull(done.closed)
      yield* TestClock.adjust("1 hour")
      const renamed = yield* board.changeTask(task.id, { title: "Pay the invoice now" })
      assert.strictEqual(renamed.closed, done.closed)
      const reopened = yield* board.changeTask(task.id, { status: "todo", comment: "Not paid after all." })
      assert.isNull(reopened.closed)
      assert.strictEqual(reopened.comments.length, 1)
    })
  )

  test.effect("refuses an assignee that is not an agent", () =>
    Effect.gen(function* () {
      const board = yield* Board.Board
      assert.strictEqual(yield* code(board.addTask({ title: "Nobody's", assignee: ghost })), "global.agent.unknown")
    })
  )

  test.effect("moves a project's tasks with it, and keeps the default space and archived spaces safe", () =>
    Effect.gen(function* () {
      const board = yield* Board.Board
      const [personal] = yield* board.spaces
      assert.isTrue(personal!.default)
      assert.strictEqual(yield* code(board.archiveSpace(personal!.id)), "work.space.default")

      const client = yield* board.addSpace({ name: "Client", color: "#00469b" })
      const project = yield* board.addProject({ name: "Website" })
      assert.strictEqual(project.space, personal!.id)
      const task = yield* board.addTask({ title: "Write the copy", project: project.id })
      yield* board.changeProject(project.id, { space: client.id })
      assert.strictEqual((yield* board.task(task.id)).space, client.id)
      assert.deepStrictEqual(
        (yield* board.project(project.id)).tasks.map((found) => found.id),
        [task.id]
      )

      yield* board.archiveSpace(client.id)
      assert.strictEqual(yield* code(board.addTask({ title: "Late", space: client.id })), "work.space.archived")
    })
  )

  test.effect("links GitHub work to a task once, and deletes a task with its log", () =>
    Effect.gen(function* () {
      const board = yield* Board.Board
      const task = yield* board.addTask({ title: "Fix the deploy" })
      const url = "https://github.com/richardamare/ras/pull/11"
      assert.deepStrictEqual((yield* board.link(task.id, url)).links, [url])
      assert.deepStrictEqual((yield* board.link(task.id, url)).links, [url])
      assert.deepStrictEqual((yield* board.unlink(task.id, url)).links, [])
      yield* board.comment(task.id, { text: "Started." })
      yield* board.deleteTask(task.id)
      assert.strictEqual(yield* code(board.task(task.id)), "NotFound")
    })
  )
})
