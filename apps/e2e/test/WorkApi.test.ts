import { assert, describe, layer } from "@effect/vitest"
import * as Arr from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Order from "effect/Order"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as Calendar from "@ras/calendar"
import * as Global from "@ras/global"
import * as Time from "@ras/kernel/Time"
import * as Suite from "../src/Suite.ts"

const personal = Calendar.CalendarId.make(101)
const readOnly = Calendar.CalendarId.make(201)

/** A space of the test's own whose work blocks go to the writable Personal calendar. */
const workSpace = Effect.gen(function* () {
  const client = yield* Suite.owner
  const space = yield* client.work.addSpace({ payload: { name: Suite.unique("Space"), color: "#3366ff" } })
  return yield* client.work.changeSpace({ params: { id: space.id }, payload: { calendar: personal } })
})

const ids = (tasks: ReadonlyArray<{ readonly id: string }>) =>
  Arr.sort(
    tasks.map((task) => task.id),
    Order.String
  )

/** A Prague day `days` from today, and a time on it. */
const day = (days: number) => Effect.map(DateTime.now, (now) => Time.addDays(Time.pragueDateOf(now), days))
const at = (date: Time.PragueDate, clock: string) => Time.PragueLocal.make(`${date}T${clock}`)

describe("the work API", () => {
  layer(Suite.layer, { excludeTestServices: true })("of a running ras", (it) => {
    it.effect("adds, renames, recolours and archives a space, and keeps the default one", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const added = yield* client.work.addSpace({ payload: { name: Suite.unique("Space"), color: "#112233" } })
        assert.isFalse(added.default)

        const name = Suite.unique("Renamed")
        const changed = yield* client.work.changeSpace({
          params: { id: added.id },
          payload: { name, color: "#445566", calendar: personal }
        })
        assert.deepInclude(changed, { name, color: "#445566", calendar: personal })

        const archived = yield* client.work.archiveSpace({ params: { id: added.id } })
        assert.isTrue(archived.archived)
        const spaces = yield* client.work.spaces()
        assert.isTrue(spaces.some((space) => space.id === added.id && space.archived))

        assert.strictEqual(
          yield* Suite.refusal(client.work.changeSpace({ params: { id: added.id }, payload: { default: true } })),
          "work.space.archived"
        )
        assert.strictEqual(
          yield* Suite.refusal(client.work.addTask({ payload: { title: "Into an archived space", space: added.id } })),
          "work.space.archived"
        )

        const original = spaces.find((space) => space.default)!
        assert.strictEqual(
          yield* Suite.refusal(client.work.archiveSpace({ params: { id: original.id } })),
          "work.space.default"
        )
      })
    )

    it.effect("moves the default to another space and back", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const original = (yield* client.work.spaces()).find((space) => space.default)!
        const other = yield* client.work.addSpace({ payload: { name: Suite.unique("Default"), color: "#778899" } })

        yield* client.work.changeSpace({ params: { id: other.id }, payload: { default: true } })
        const task = yield* client.work.addTask({ payload: { title: Suite.unique("Lands in the default") } })
        assert.strictEqual(task.space, other.id)

        yield* client.work.changeSpace({ params: { id: original.id }, payload: { default: true } })
        const defaults = (yield* client.work.spaces()).filter((space) => space.default).map((space) => space.id)
        assert.deepStrictEqual(defaults, [original.id])
        yield* client.work.deleteTask({ params: { id: task.id } })
      })
    )

    it.effect("refuses a space calendar ras cannot write, and an unknown one", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const space = yield* client.work.addSpace({ payload: { name: Suite.unique("Space"), color: "#000000" } })
        assert.strictEqual(
          yield* Suite.refusal(client.work.changeSpace({ params: { id: space.id }, payload: { calendar: readOnly } })),
          "work.space.calendar"
        )
        assert.strictEqual(
          yield* Suite.refusal(
            client.work.changeSpace({ params: { id: space.id }, payload: { calendar: Calendar.CalendarId.make(999) } })
          ),
          "NotFound"
        )
      })
    )

    it.effect("adds a project, changes it and shows its tasks in its detail", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const space = yield* workSpace
        const deadline = yield* day(20)
        const project = yield* client.work.addProject({
          payload: { name: Suite.unique("Project"), space: space.id, deadline, description: "The plan." }
        })
        assert.deepInclude(project, { space: space.id, status: "active", deadline, description: "The plan." })

        const listed = yield* client.work.projects({ query: { space: space.id } })
        assert.deepStrictEqual(
          listed.map((found) => found.id),
          [project.id]
        )

        const paused = yield* client.work.changeProject({
          params: { id: project.id },
          payload: { status: "paused", deadline: null, description: null }
        })
        assert.deepInclude(paused, { status: "paused", deadline: null, description: null })

        const task = yield* client.work.addTask({
          payload: { title: Suite.unique("Project task"), project: project.id }
        })
        assert.strictEqual(task.space, space.id)
        const detail = yield* client.work.project({ params: { id: project.id } })
        assert.deepStrictEqual(
          detail.tasks.map((found) => found.id),
          [task.id]
        )
      })
    )

    it.effect("filters tasks by status, assignee, space, project and change time", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const space = yield* workSpace
        const agent = yield* client.global.addAgent({
          payload: { slug: Global.AgentSlug.make(`filter-${crypto.randomUUID().slice(0, 8)}`), name: "Filter agent" }
        })
        const project = yield* client.work.addProject({ payload: { name: Suite.unique("Project"), space: space.id } })
        const inbox = yield* client.work.addTask({
          payload: { title: Suite.unique("Inbox"), space: space.id, status: "inbox", assignee: agent.slug }
        })
        const todo = yield* client.work.addTask({ payload: { title: Suite.unique("Todo"), project: project.id } })

        assert.deepStrictEqual(ids(yield* client.work.tasks({ query: { space: space.id } })), ids([inbox, todo]))
        assert.deepStrictEqual(ids(yield* client.work.tasks({ query: { space: space.id, status: "inbox" } })), [
          inbox.id
        ])
        assert.deepStrictEqual(ids(yield* client.work.tasks({ query: { assignee: agent.slug } })), [inbox.id])
        assert.deepStrictEqual(ids(yield* client.work.tasks({ query: { project: project.id } })), [todo.id])

        const since = Time.toPragueLocal(yield* DateTime.now)
        const later = yield* client.work.tasks({ query: { space: space.id, updatedSince: since } })
        assert.isTrue(later.every((task) => task.updated >= since))
      })
    )

    it.effect("changes every field of a task, and refuses an assignee that is no agent", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const space = yield* workSpace
        const project = yield* client.work.addProject({ payload: { name: Suite.unique("Project"), space: space.id } })
        const task = yield* client.work.addTask({ payload: { title: Suite.unique("Task"), space: space.id } })
        const agent = yield* client.global.addAgent({
          payload: { slug: Global.AgentSlug.make(`assignee-${crypto.randomUUID().slice(0, 8)}`), name: "Assignee" }
        })
        const deadline = yield* day(7)
        const title = Suite.unique("Renamed task")

        const changed = yield* client.work.changeTask({
          params: { id: task.id },
          payload: {
            title,
            body: "The brief.",
            priority: "urgent",
            deadline,
            estimate: 90,
            assignee: agent.slug,
            project: project.id,
            status: "in_progress"
          }
        })
        assert.deepInclude(changed, {
          title,
          body: "The brief.",
          priority: "urgent",
          deadline,
          assignee: agent.slug,
          project: project.id,
          status: "in_progress"
        })

        const cleared = yield* client.work.changeTask({
          params: { id: task.id },
          payload: { deadline: null, estimate: null, project: null, assignee: "owner" }
        })
        assert.deepInclude(cleared, { deadline: null, project: null, assignee: "owner" })

        assert.strictEqual(
          yield* Suite.refusal(
            client.work.changeTask({ params: { id: task.id }, payload: { assignee: Global.AgentSlug.make("nobody") } })
          ),
          "global.agent.unknown"
        )
      })
    )

    it.effect("takes a comment with a move to blocked or review, and refuses the move without one", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const task = yield* client.work.addTask({ payload: { title: Suite.unique("Explained") } })

        assert.strictEqual(
          yield* Suite.refusal(client.work.changeTask({ params: { id: task.id }, payload: { status: "blocked" } })),
          "work.task.comment"
        )
        assert.strictEqual(
          yield* Suite.refusal(client.work.changeTask({ params: { id: task.id }, payload: { status: "review" } })),
          "work.task.comment"
        )

        yield* client.work.changeTask({
          params: { id: task.id },
          payload: { status: "blocked", comment: "Waiting for the keys." }
        })
        const reviewed = yield* client.work.changeTask({
          params: { id: task.id },
          payload: { status: "review", comment: "Check the copy." }
        })
        assert.deepStrictEqual(
          reviewed.comments.map((comment) => comment.text),
          ["Waiting for the keys.", "Check the copy."]
        )
      })
    )

    it.effect("links and unlinks a GitHub issue, and refuses a link elsewhere", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const task = yield* client.work.addTask({ payload: { title: Suite.unique("Linked") } })
        const url = "https://github.com/acme/widgets/issues/42"

        const linked = yield* client.work.link({ params: { id: task.id }, payload: { url } })
        assert.deepStrictEqual(linked.links, [url])
        const commented = yield* client.work.comment({
          params: { id: task.id },
          payload: { text: "Opened the PR.", link: "https://github.com/acme/widgets/pull/43" }
        })
        assert.strictEqual(commented.comments[0]!.link, "https://github.com/acme/widgets/pull/43")

        const unlinked = yield* client.work.unlink({ params: { id: task.id }, query: { url } })
        assert.deepStrictEqual(unlinked.links, [])

        const { url: server } = yield* Suite.Server
        const response = yield* HttpClientRequest.post(new URL(`/work/tasks/${task.id}/links`, server)).pipe(
          HttpClientRequest.setHeader("cookie", yield* Suite.sessionCookie),
          HttpClientRequest.bodyJsonUnsafe({ url: "https://example.com/issues/1" }),
          HttpClient.execute
        )
        assert.strictEqual(response.status, 400)
      })
    )

    it.effect("answers 404 for a task, project or space that does not exist", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const task = yield* client.work.addTask({ payload: { title: Suite.unique("Gone") } })
        assert.isNull(yield* client.work.deleteTask({ params: { id: task.id } }))
        assert.strictEqual(yield* Suite.refusal(client.work.task({ params: { id: task.id } })), "NotFound")
        assert.strictEqual(
          yield* Suite.refusal(client.work.changeTask({ params: { id: task.id }, payload: { title: "x" } })),
          "NotFound"
        )

        const project = yield* client.work.addProject({ payload: { name: Suite.unique("Project") } })
        const space = yield* workSpace
        assert.strictEqual(
          yield* Suite.refusal(client.work.project({ params: { id: crypto.randomUUID() as typeof project.id } })),
          "NotFound"
        )
        assert.strictEqual(
          yield* Suite.refusal(client.work.archiveSpace({ params: { id: crypto.randomUUID() as typeof space.id } })),
          "NotFound"
        )
      })
    )

    it.effect("plans a block, lists it, moves it and removes it, and refuses an overlap and the past", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const space = yield* workSpace
        const task = yield* client.work.addTask({ payload: { title: Suite.unique("Planned"), space: space.id } })
        const date = yield* day(30)

        const block = yield* client.work.plan({ payload: { task: task.id, start: at(date, "09:00"), minutes: 60 } })
        assert.deepInclude(block, {
          task: task.id,
          calendar: personal,
          start: at(date, "09:00"),
          end: at(date, "10:00")
        })
        assert.strictEqual(block.state, "planned")

        const listed = yield* client.work.blocks({ query: { from: at(date, "00:00"), to: at(date, "23:59") } })
        assert.isTrue(listed.some((found) => found.id === block.id))

        assert.strictEqual(
          yield* Suite.refusal(client.work.plan({ payload: { task: task.id, start: at(date, "09:30"), minutes: 30 } })),
          "work.block.overlap"
        )
        assert.strictEqual(
          yield* Suite.refusal(
            client.work.plan({ payload: { task: task.id, start: at(yield* day(-1), "09:00"), minutes: 30 } })
          ),
          "work.block.past"
        )

        const moved = yield* client.work.move({
          params: { id: block.id },
          payload: { start: at(date, "14:00"), end: at(date, "15:30") }
        })
        assert.deepInclude(moved, { start: at(date, "14:00"), end: at(date, "15:30") })

        yield* client.work.remove({ params: { id: block.id } })
        const after = yield* client.work.blocks({ query: { from: at(date, "00:00"), to: at(date, "23:59") } })
        assert.isFalse(after.some((found) => found.id === block.id))
      })
    )

    it.effect("refuses to plan work in a space without a calendar, on a done task and on an agent's task", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const date = yield* day(31)
        const bare = yield* client.work.addSpace({ payload: { name: Suite.unique("Bare"), color: "#abcdef" } })
        const uncalendared = yield* client.work.addTask({ payload: { title: Suite.unique("Bare"), space: bare.id } })
        assert.strictEqual(
          yield* Suite.refusal(
            client.work.plan({ payload: { task: uncalendared.id, start: at(date, "09:00"), minutes: 30 } })
          ),
          "work.block.calendar"
        )

        const space = yield* workSpace
        const done = yield* client.work.addTask({ payload: { title: Suite.unique("Done"), space: space.id } })
        yield* client.work.changeTask({ params: { id: done.id }, payload: { status: "done" } })
        assert.strictEqual(
          yield* Suite.refusal(client.work.plan({ payload: { task: done.id, start: at(date, "10:00"), minutes: 30 } })),
          "work.block.done"
        )

        const agent = yield* client.global.addAgent({
          payload: { slug: Global.AgentSlug.make(`planner-${crypto.randomUUID().slice(0, 8)}`), name: "Planner" }
        })
        const theirs = yield* client.work.addTask({
          payload: { title: Suite.unique("Theirs"), space: space.id, assignee: agent.slug }
        })
        assert.strictEqual(
          yield* Suite.refusal(
            client.work.plan({ payload: { task: theirs.id, start: at(date, "11:00"), minutes: 30 } })
          ),
          "work.block.agent"
        )
      })
    )

    it.effect("drafts blocks, confirms one by id and discards the rest", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const space = yield* workSpace
        const task = yield* client.work.addTask({ payload: { title: Suite.unique("Drafted"), space: space.id } })
        const date = yield* day(32)

        const first = yield* client.work.plan({
          payload: { task: task.id, start: at(date, "09:00"), minutes: 30, draft: true }
        })
        const second = yield* client.work.plan({
          payload: { task: task.id, start: at(date, "10:00"), minutes: 30, draft: true }
        })
        assert.deepStrictEqual([first.state, second.state], ["draft", "draft"])

        const confirmed = yield* client.work.confirmDrafts({ payload: { drafts: [first.id] } })
        assert.deepStrictEqual(
          confirmed.confirmed.map((outcome) => outcome.id),
          [first.id]
        )
        assert.deepStrictEqual(confirmed.refused, [])

        const discarded = yield* client.work.discardDrafts()
        assert.isAtLeast(discarded.discarded, 1)
        const left = yield* client.work.blocks({ query: { from: at(date, "00:00"), to: at(date, "23:59") } })
        assert.deepStrictEqual(
          left.filter((block) => block.task === task.id).map((block) => [block.id, block.state]),
          [[first.id, "planned"]]
        )
        yield* client.work.remove({ params: { id: first.id } })
      })
    )

    it.effect("starts work, shows it running, refuses a second start, and stops it", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const space = yield* workSpace
        const task = yield* client.work.addTask({ payload: { title: Suite.unique("Running"), space: space.id } })
        const other = yield* client.work.addTask({ payload: { title: Suite.unique("Other"), space: space.id } })

        const started = yield* client.work.start({ payload: { task: task.id } })
        assert.deepInclude(started, { task: task.id, state: "running", end: null })
        assert.strictEqual((yield* client.work.running())?.id, started.id)
        assert.strictEqual(
          yield* Suite.refusal(client.work.start({ payload: { task: other.id } })),
          "work.block.running"
        )
        assert.strictEqual(
          yield* Suite.refusal(client.work.remove({ params: { id: started.id } })),
          "work.block.running"
        )

        const stopped = yield* client.work.stop()
        assert.strictEqual(stopped.id, started.id)
        assert.notStrictEqual(stopped.state, "running")
        assert.isNull(yield* client.work.running())
        assert.strictEqual(yield* Suite.refusal(client.work.stop()), "work.block.idle")
      })
    )

    it.effect(
      "logs work that happened, counts it as time spent, closes rather than deletes its task, and refuses the future",
      () =>
        Effect.gen(function* () {
          const client = yield* Suite.owner
          const space = yield* workSpace
          const task = yield* client.work.addTask({ payload: { title: Suite.unique("Logged"), space: space.id } })
          const yesterday = yield* day(-1)

          const logged = yield* client.work.log({
            payload: { task: task.id, end: at(yesterday, "17:00"), minutes: 45 }
          })
          assert.deepInclude(logged, { state: "done", start: at(yesterday, "16:15"), end: at(yesterday, "17:00") })
          assert.strictEqual((yield* client.work.task({ params: { id: task.id } })).spent, 45)

          assert.strictEqual(
            yield* Suite.refusal(
              client.work.log({ payload: { task: task.id, end: at(yield* day(1), "17:00"), minutes: 30 } })
            ),
            "work.block.future"
          )
          assert.strictEqual(
            yield* Suite.refusal(
              client.work.move({
                params: { id: logged.id },
                payload: { start: at(yield* day(2), "09:00"), end: at(yield* day(2), "10:00") }
              })
            ),
            "work.block.future"
          )

          const kept = yield* client.work.deleteTask({ params: { id: task.id } })
          assert.deepInclude(kept, { id: task.id, status: "done" })
          assert.strictEqual((yield* client.work.task({ params: { id: task.id } })).status, "done")
        })
    )
  })
})
