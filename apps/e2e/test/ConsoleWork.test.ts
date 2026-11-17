import { assert, describe, layer } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Schedule from "effect/Schedule"
import * as Calendar from "@ras/calendar"
import * as Global from "@ras/global"
import * as Time from "@ras/kernel/Time"
import type * as Playwright from "playwright"
import * as Suite from "../src/Suite.ts"

const today = Effect.map(DateTime.now, Time.pragueDateOf)

/** A space of the test's own whose blocks go to the writable Personal calendar. */
const workSpace = Effect.gen(function* () {
  const client = yield* Suite.owner
  const space = yield* client.work.addSpace({ payload: { name: Suite.unique("Space"), color: "#cc3366" } })
  return yield* client.work.changeSpace({
    params: { id: space.id },
    payload: { calendar: Calendar.CalendarId.make(101) }
  })
})

/** Picks `option` in the select labelled `label` within `scope`. */
const choose = (page: Playwright.Page, scope: Playwright.Locator, label: string, option: string) =>
  Effect.andThen(
    Suite.use(() => scope.getByRole("combobox", { name: label }).click()),
    Suite.use(() => page.getByRole("option", { name: option, exact: true }).click())
  )

/** Polls `read` until what it answers holds what `done` looks for. */
const becomes = <A, E, R>(read: Effect.Effect<A, E, R>, done: (found: A) => boolean) =>
  Effect.repeat(read, { until: done, schedule: Schedule.spaced(Duration.millis(100)), times: 50 })

describe("the console's work pages", () => {
  layer(Suite.layer, { excludeTestServices: true })("in Chromium", (it) => {
    it.effect("drags a card between board columns, and asks for a note on the way into Blocked", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const task = yield* client.work.addTask({ payload: { title: Suite.unique("Dragged") } })
        const page = yield* Suite.signedInPage
        yield* Suite.use(() => page.goto("/board"))

        const card = page.getByRole("button", { name: task.title })
        yield* Suite.use(() => card.dragTo(page.getByRole("region", { name: "In progress" })))
        yield* becomes(client.work.task({ params: { id: task.id } }), (found) => found.status === "in_progress")
        yield* Suite.use(() => page.getByRole("region", { name: "In progress" }).getByText(task.title).waitFor())

        yield* Suite.use(() => card.dragTo(page.getByRole("region", { name: "Blocked" })))
        const dialog = page.getByRole("dialog", { name: `Move “${task.title}” to Blocked` })
        yield* Suite.use(() => dialog.getByText("Say what is needed.").waitFor())
        yield* Suite.use(() => dialog.getByLabel("Comment").fill("Waiting for the client."))
        yield* Suite.use(() => dialog.getByRole("button", { name: "Move" }).click())

        const blocked = yield* becomes(
          client.work.task({ params: { id: task.id } }),
          (found) => found.status === "blocked"
        )
        assert.deepStrictEqual(
          blocked.comments.map((comment) => comment.text),
          ["Waiting for the client."]
        )
      })
    )

    it.effect("narrows the board to a project and to an assignee", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const space = yield* workSpace
        const project = yield* client.work.addProject({ payload: { name: Suite.unique("Filtered"), space: space.id } })
        const inProject = yield* client.work.addTask({ payload: { title: Suite.unique("In it"), project: project.id } })
        const agent = yield* client.global.addAgent({
          payload: { slug: Global.AgentSlug.make(`board-${crypto.randomUUID().slice(0, 8)}`), name: "Board agent" }
        })
        const theirs = yield* client.work.addTask({
          payload: { title: Suite.unique("Theirs"), space: space.id, assignee: agent.slug }
        })
        const page = yield* Suite.signedInPage
        yield* Suite.use(() => page.goto("/board"))
        const main = page.getByRole("main")

        yield* choose(page, main, "Project", project.name)
        yield* Suite.use(() => main.getByText(inProject.title).waitFor())
        yield* Suite.use(() => main.getByText(theirs.title).waitFor({ state: "detached" }))

        yield* choose(page, main, "Project", "Project: all")
        yield* choose(page, main, "Assignee", "Board agent")
        yield* Suite.use(() => main.getByText(theirs.title).waitFor())
        yield* Suite.use(() => main.getByText(inProject.title).waitFor({ state: "detached" }))
      })
    )

    it.effect("opens a task from the board, changes its status and assignee, and comments on it", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const task = yield* client.work.addTask({ payload: { title: Suite.unique("Opened"), body: "The brief." } })
        const agent = yield* client.global.addAgent({
          payload: { slug: Global.AgentSlug.make(`dialog-${crypto.randomUUID().slice(0, 8)}`), name: "Dialog agent" }
        })
        const page = yield* Suite.signedInPage
        yield* Suite.use(() => page.goto("/board"))
        yield* Suite.use(() => page.getByRole("button", { name: task.title }).click())

        const dialog = page.getByRole("dialog", { name: task.title })
        yield* Suite.use(() => dialog.getByText("The brief.").waitFor())
        assert.strictEqual(new URL(page.url()).searchParams.get("task"), task.id)

        yield* choose(page, dialog, "Status", "Review")
        yield* Suite.use(() => page.getByText("Say what to check.").waitFor())
        yield* Suite.use(() => dialog.getByLabel("Comment").fill("Check the totals."))
        yield* choose(page, dialog, "Status", "Review")
        const reviewed = yield* becomes(
          client.work.task({ params: { id: task.id } }),
          (found) => found.status === "review"
        )
        assert.deepStrictEqual(
          reviewed.comments.map((comment) => comment.text),
          ["Check the totals."]
        )

        yield* choose(page, dialog, "Assignee", "Dialog agent")
        yield* becomes(client.work.task({ params: { id: task.id } }), (found) => found.assignee === agent.slug)

        // The dialog empties the comment box once a change saves, so the comment is typed after the dialog shows it.
        yield* Suite.use(() => dialog.getByRole("combobox", { name: "Assignee" }).getByText("Dialog agent").waitFor())
        yield* Suite.use(() => dialog.getByLabel("Comment").fill("Looks right."))
        yield* Suite.use(() => dialog.getByRole("button", { name: "Add comment" }).click())
        yield* Suite.use(() => dialog.getByText("Looks right.").waitFor())
        yield* Suite.use(() => dialog.getByText("2 comments").waitFor())
      })
    )

    it.effect("finds a task in the tasks table, shows done ones under All, and opens one from its URL", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const open = yield* client.work.addTask({ payload: { title: Suite.unique("Searchable") } })
        const done = yield* client.work.addTask({ payload: { title: Suite.unique("Finished") } })
        yield* client.work.changeTask({ params: { id: done.id }, payload: { status: "done" } })
        const page = yield* Suite.signedInPage
        yield* Suite.use(() => page.goto("/tasks"))
        const main = page.getByRole("main")

        yield* Suite.use(() => main.getByLabel("Search tasks").fill(open.title))
        yield* Suite.use(() => main.getByRole("row", { name: new RegExp(open.title) }).waitFor())
        assert.strictEqual(yield* Suite.use(() => main.getByRole("row").count()), 2)

        yield* Suite.use(() => main.getByLabel("Search tasks").fill(done.title))
        yield* Suite.use(() => main.getByText("No task matches.").waitFor())
        yield* choose(page, main, "Status", "All")
        yield* Suite.use(() => main.getByRole("row", { name: new RegExp(done.title) }).click())
        yield* Suite.use(() => page.getByRole("dialog", { name: done.title }).waitFor())

        yield* Suite.use(() => page.goto(`/tasks?task=${open.id}`))
        yield* Suite.use(() => page.getByRole("dialog", { name: open.title }).waitFor())
      })
    )

    it.effect("shows a project's progress, its tasks and its upcoming blocks", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const space = yield* workSpace
        const project = yield* client.work.addProject({ payload: { name: Suite.unique("Progress"), space: space.id } })
        const first = yield* client.work.addTask({ payload: { title: Suite.unique("First"), project: project.id } })
        const second = yield* client.work.addTask({ payload: { title: Suite.unique("Second"), project: project.id } })
        yield* client.work.changeTask({ params: { id: second.id }, payload: { status: "done" } })
        const date = Time.addDays(yield* today, 50)
        yield* client.work.plan({
          payload: { task: first.id, start: Time.PragueLocal.make(`${date}T09:00`), minutes: 45 }
        })
        const page = yield* Suite.signedInPage
        yield* Suite.use(() => page.goto("/projects"))

        const row = page.getByRole("row", { name: new RegExp(project.name) })
        yield* Suite.use(() => row.getByText("1 of 2").waitFor())
        yield* Suite.use(() => row.click())
        yield* Suite.use(() => page.getByRole("heading", { name: project.name, level: 1 }).waitFor())
        assert.strictEqual(new URL(page.url()).pathname, `/projects/${project.id}`)
        yield* Suite.use(() => page.getByText(first.title).first().waitFor())
        yield* Suite.use(() => page.getByText(second.title).first().waitFor())
        yield* Suite.use(() => page.getByText("No blocks planned.").waitFor({ state: "detached" }))

        yield* Suite.use(() =>
          page
            .getByRole("button", { name: new RegExp(first.title) })
            .first()
            .click()
        )
        yield* Suite.use(() => page.getByRole("dialog", { name: first.title }).waitFor())
      })
    )

    it.effect("shows the running block on the home page and stops it there", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const space = yield* workSpace
        const task = yield* client.work.addTask({ payload: { title: Suite.unique("On the clock"), space: space.id } })
        yield* client.work.start({ payload: { task: task.id } })
        const page = yield* Suite.signedInPage
        yield* Suite.use(() => page.goto("/"))

        yield* Suite.use(() => page.getByText(task.title).first().waitFor())
        yield* Suite.use(() => page.getByRole("button", { name: "Stop" }).click())
        yield* Suite.use(() => page.getByText("No block is running.").waitFor())
        assert.isNull(yield* client.work.running())

        const blocks = yield* client.work.blocks({
          query: {
            from: Time.PragueLocal.make(`${yield* today}T00:00`),
            to: Time.PragueLocal.make(`${yield* today}T23:59`)
          }
        })
        // A stopped block lasts a minute at least; removing it frees that minute for the other tests' timers.
        yield* Effect.forEach(
          blocks.filter((block) => block.task === task.id),
          (block) => client.work.remove({ params: { id: block.id } })
        )
      })
    )

    it.effect("lists today's deadlines, what waits in review and today's calendar on the home page", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const due = yield* client.work.addTask({
          payload: { title: Suite.unique("Due today"), deadline: yield* today }
        })
        const page = yield* Suite.signedInPage
        yield* Suite.use(() => page.goto("/"))

        yield* Suite.use(() => page.getByText("Due today", { exact: true }).waitFor())
        yield* Suite.use(() => page.getByText(due.title).first().waitFor())
        yield* Suite.use(() => page.getByText("Today in the calendar").waitFor())
        yield* Suite.use(() => page.getByText("Standup").first().waitFor())

        yield* Suite.use(() => page.getByText(due.title).first().click())
        yield* Suite.use(() => page.getByRole("dialog", { name: due.title }).waitFor())
      })
    )
  })
})
