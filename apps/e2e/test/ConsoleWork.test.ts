import { assert, describe, layer } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Schedule from "effect/Schedule"
import * as Calendar from "@ras/calendar"
import * as Global from "@ras/global"
import * as Time from "@ras/kernel/Time"
import type * as Browser from "../src/Browser.ts"
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
const choose = (page: Browser.Page, scope: Browser.Locator, label: string, option: string) =>
  Effect.andThen(
    scope.getByRole("combobox", { name: label }).click(),
    page.getByRole("option", { name: option, exact: true }).click()
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
        yield* page.goto("/board")

        const card = page.getByRole("button", { name: task.title })
        yield* card.dragTo(page.getByRole("region", { name: "In progress" }))
        yield* becomes(client.work.task({ params: { id: task.id } }), (found) => found.status === "in_progress")
        yield* page.getByRole("region", { name: "In progress" }).getByText(task.title).waitFor()

        yield* card.dragTo(page.getByRole("region", { name: "Blocked" }))
        const dialog = page.getByRole("dialog", { name: `Move “${task.title}” to Blocked` })
        yield* dialog.getByText("Say what is needed.").waitFor()
        yield* dialog.getByLabel("Comment").fill("Waiting for the client.")
        yield* dialog.getByRole("button", { name: "Move" }).click()

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

    it.effect("keeps the board in the window and scrolls a full column within itself", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const space = yield* workSpace
        const project = yield* client.work.addProject({ payload: { name: Suite.unique("Long"), space: space.id } })
        const tasks = yield* Effect.forEach(Array.from({ length: 30 }), () =>
          client.work.addTask({ payload: { title: Suite.unique("Pile"), project: project.id } })
        )
        const page = yield* Suite.signedInPage
        yield* Effect.promise(() => page.raw.setViewportSize({ width: 1280, height: 720 }))
        yield* page.goto(`/board?project=${project.id}`)
        yield* page.getByText(tasks[29]!.title).waitFor()

        const layout = yield* Effect.promise(() =>
          page.raw
            .getByRole("region")
            .filter({ has: page.raw.getByText(tasks[0]!.title) })
            .evaluate((column) => {
              const list = column.lastElementChild as HTMLElement
              return {
                columnOverflow: column.scrollHeight - column.clientHeight,
                columnBottom: column.getBoundingClientRect().bottom,
                listOverflow: list.scrollHeight - list.clientHeight
              }
            })
        )
        assert.strictEqual(layout.columnOverflow, 0)
        assert.isAtMost(layout.columnBottom, 720)
        assert.isAbove(layout.listOverflow, 0)
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
        yield* page.goto("/board")
        const main = page.getByRole("main")

        yield* choose(page, main, "Project", project.name)
        yield* main.getByText(inProject.title).waitFor()
        yield* main.getByText(theirs.title).waitFor({ state: "detached" })

        yield* choose(page, main, "Project", "Project: all")
        yield* choose(page, main, "Assignee", "Board agent")
        yield* main.getByText(theirs.title).waitFor()
        yield* main.getByText(inProject.title).waitFor({ state: "detached" })
      })
    )

    it.effect("finds a project in the board's filter by typing part of its name", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const space = yield* workSpace
        const wanted = yield* client.work.addProject({ payload: { name: Suite.unique("Accounting"), space: space.id } })
        const other = yield* client.work.addProject({ payload: { name: Suite.unique("Logistics"), space: space.id } })
        const inWanted = yield* client.work.addTask({ payload: { title: Suite.unique("Ledger"), project: wanted.id } })
        const page = yield* Suite.signedInPage
        yield* page.goto("/board")
        const main = page.getByRole("main")

        yield* main.getByRole("combobox", { name: "Project" }).click()
        yield* page.locator(`[data-slot="command-input"]`).fill(wanted.name.slice(-8))
        yield* page.getByRole("option", { name: other.name }).waitFor({ state: "detached" })
        yield* page.getByRole("option", { name: wanted.name }).click()

        yield* main.getByRole("combobox", { name: "Project" }).getByText(wanted.name).waitFor()
        yield* page.waitForURL((url) => url.searchParams.get("project") === wanted.id)
        yield* main.getByText(inWanted.title).waitFor()
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
        yield* page.goto("/board")
        yield* page.getByRole("button", { name: task.title }).click()

        const dialog = page.getByRole("dialog", { name: task.title })
        yield* dialog.getByText("The brief.").waitFor()
        assert.strictEqual((yield* page.url).searchParams.get("task"), task.id)

        yield* choose(page, dialog, "Status", "Review")
        yield* page.getByText("Say what to check.").waitFor()
        yield* dialog.getByLabel("Comment").fill("Check the totals.")
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
        yield* dialog.getByRole("combobox", { name: "Assignee" }).getByText("Dialog agent").waitFor()
        yield* dialog.getByLabel("Comment").fill("Looks right.")
        yield* dialog.getByRole("button", { name: "Add comment" }).click()
        yield* dialog.getByText("Looks right.").waitFor()
        yield* dialog.getByText("2 comments").waitFor()
      })
    )

    it.effect("finds a task in the tasks table, shows done ones under All, and opens one from its URL", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const open = yield* client.work.addTask({ payload: { title: Suite.unique("Searchable") } })
        const done = yield* client.work.addTask({ payload: { title: Suite.unique("Finished") } })
        yield* client.work.changeTask({ params: { id: done.id }, payload: { status: "done" } })
        const page = yield* Suite.signedInPage
        yield* page.goto("/tasks")
        const main = page.getByRole("main")

        yield* main.getByLabel("Search tasks").fill(open.title)
        yield* main.getByRole("row", { name: new RegExp(open.title) }).waitFor()
        assert.strictEqual(yield* main.getByRole("row").count, 2)

        yield* main.getByLabel("Search tasks").fill(done.title)
        yield* main.getByText("No task matches.").waitFor()
        yield* choose(page, main, "Status", "All")
        yield* main.getByRole("row", { name: new RegExp(done.title) }).click()
        yield* page.getByRole("dialog", { name: done.title }).waitFor()

        yield* page.goto(`/tasks?task=${open.id}`)
        yield* page.getByRole("dialog", { name: open.title }).waitFor()
      })
    )

    it.effect("ticks a task done in the tasks table, takes a slip back with Undo, and reopens a done task", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const batch = Suite.unique("Tick")
        const slip = yield* client.work.addTask({ payload: { title: `${batch} slip` } })
        const finished = yield* client.work.addTask({ payload: { title: `${batch} finished` } })
        const page = yield* Suite.signedInPage
        yield* page.goto(`/tasks?q=${encodeURIComponent(batch)}`)
        const main = page.getByRole("main")

        yield* main.getByRole("checkbox", { name: `Mark done: ${slip.title}` }).click()
        yield* page.getByText(`${slip.title} is done.`).waitFor()
        yield* page.getByRole("button", { name: "Undo" }).click()
        yield* main.getByRole("checkbox", { name: `Mark done: ${slip.title}` }).waitFor()
        yield* Effect.sleep(Duration.millis(4500))
        assert.strictEqual((yield* client.work.task({ params: { id: slip.id } })).status, "todo")

        yield* main.getByRole("checkbox", { name: `Mark done: ${finished.title}` }).click()
        yield* Effect.repeat(client.work.task({ params: { id: finished.id } }), {
          until: (found) => found.status === "done",
          schedule: Schedule.spaced(Duration.millis(200)),
          times: 50
        })
        yield* main.getByRole("row", { name: new RegExp(finished.title) }).waitFor({ state: "detached" })

        yield* choose(page, main, "Status", "All")
        yield* main.getByRole("checkbox", { name: `Reopen: ${finished.title}` }).click()
        yield* becomes(client.work.task({ params: { id: finished.id } }), (found) => found.status === "todo")
      })
    )

    it.effect("keeps a long task title to one line in the tasks table and shows it whole on hover", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const batch = Suite.unique("Width")
        const long = yield* client.work.addTask({
          payload: { title: `${batch} ${"a very long title that keeps going ".repeat(8)}end` }
        })
        const short = yield* client.work.addTask({ payload: { title: `${batch} short` } })
        const page = yield* Suite.signedInPage
        yield* page.goto(`/tasks?q=${encodeURIComponent(batch)}`)
        const main = page.getByRole("main")

        const title = main.getByText(long.title, { exact: true })
        const box = yield* Effect.promise(() => title.raw.boundingBox())
        assert.isAtMost(box!.width, 320)
        assert.isBelow(box!.height, 30)

        yield* title.hover()
        yield* page.getByRole("tooltip", { name: long.title }).waitFor()
        yield* Effect.promise(() => page.raw.mouse.move(0, 0, { steps: 10 }))
        yield* page.getByRole("tooltip").waitFor({ state: "detached" })

        yield* main.getByText(short.title, { exact: true }).hover()
        yield* Effect.sleep(Duration.millis(600))
        assert.strictEqual(yield* page.getByRole("tooltip").count, 0)
      })
    )

    it.effect("edits a task's title, brief, project, priority, deadline, estimate and links in its dialog", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const space = yield* workSpace
        const project = yield* client.work.addProject({ payload: { name: Suite.unique("Home"), space: space.id } })
        const task = yield* client.work.addTask({ payload: { title: Suite.unique("Draft"), body: "Old brief." } })
        const read = client.work.task({ params: { id: task.id } })
        const page = yield* Suite.signedInPage
        yield* page.goto(`/tasks?task=${task.id}`)
        const dialog = page.getByRole("dialog")
        yield* dialog.getByText("Old brief.").waitFor()

        const title = Suite.unique("Renamed")
        yield* dialog.getByRole("button", { name: "Edit title and brief" }).click()
        yield* dialog.getByLabel("Task", { exact: true }).fill(title)
        yield* dialog.getByLabel("Brief", { exact: true }).fill("New brief.")
        yield* dialog.getByRole("button", { name: "Save" }).click()
        yield* becomes(read, (found) => found.title === title && found.body === "New brief.")
        yield* page.getByRole("dialog", { name: title }).getByText("New brief.").waitFor()

        yield* choose(page, dialog, "Project", project.name)
        yield* becomes(read, (found) => found.project === project.id)
        yield* choose(page, dialog, "Priority", "Urgent")
        yield* becomes(read, (found) => found.priority === "urgent")

        yield* dialog.getByLabel("Deadline").fill("2031-03-14")
        yield* becomes(read, (found) => found.deadline === "2031-03-14")

        yield* dialog.getByLabel("Estimate").fill("1:30")
        yield* dialog.getByLabel("Estimate").blur
        yield* becomes(read, (found) => found.estimate === 90)

        const issue = "https://github.com/acme/app/issues/7"
        yield* dialog.getByLabel("GitHub issue or pull request").fill(issue)
        yield* dialog.getByRole("button", { name: "Attach" }).click()
        yield* becomes(read, (found) => found.links.includes(issue))
        yield* dialog.getByRole("button", { name: `Detach ${issue}` }).click()
        yield* becomes(read, (found) => found.links.length === 0)
      })
    )

    it.effect("deletes a task from its dialog, and moves one with work done on it to Done instead", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const space = yield* workSpace
        const project = yield* client.work.addProject({ payload: { name: Suite.unique("Bin"), space: space.id } })
        const idle = yield* client.work.addTask({ payload: { title: Suite.unique("Idle"), project: project.id } })
        const worked = yield* client.work.addTask({ payload: { title: Suite.unique("Worked"), project: project.id } })
        const day = Time.addDays(yield* today, -22)
        yield* client.work.add({
          payload: {
            task: worked.id,
            start: Time.PragueLocal.make(`${day}T06:00`),
            end: Time.PragueLocal.make(`${day}T06:30`)
          }
        })
        const page = yield* Suite.signedInPage

        const remove = (task: typeof idle) =>
          Effect.gen(function* () {
            yield* page.goto(`/tasks?task=${task.id}`)
            yield* page.getByRole("dialog", { name: task.title }).getByRole("button", { name: "Delete task" }).click()
            yield* page
              .getByRole("dialog", { name: `Delete “${task.title}”?` })
              .getByRole("button", { name: "Delete" })
              .click()
            yield* page.getByRole("dialog", { name: task.title }).waitFor({ state: "detached" })
          })

        yield* remove(idle)
        yield* page.getByText(`${idle.title} is deleted.`).waitFor()
        yield* becomes(client.work.tasks({ query: {} }), (tasks) => !tasks.some((one) => one.id === idle.id))

        yield* remove(worked)
        yield* page.getByText(`${worked.title} has work on it, so it moved to Done.`).waitFor()
        yield* becomes(client.work.task({ params: { id: worked.id } }), (found) => found.status === "done")
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
        yield* client.work.add({
          payload: {
            task: first.id,
            start: Time.PragueLocal.make(`${date}T09:00`),
            end: Time.PragueLocal.make(`${date}T09:45`)
          }
        })
        const page = yield* Suite.signedInPage
        yield* page.goto("/projects")

        const row = page.getByRole("row", { name: new RegExp(project.name) })
        yield* row.getByText("1 of 2").waitFor()
        yield* row.click()
        yield* page.getByRole("heading", { name: project.name, level: 1 }).waitFor()
        assert.strictEqual((yield* page.url).pathname, `/projects/${project.id}`)
        yield* page.getByText(first.title).first().waitFor()
        yield* page.getByText(second.title).first().waitFor()
        yield* page.getByText("No blocks planned.").waitFor({ state: "detached" })

        yield* page
          .getByRole("button", { name: new RegExp(first.title) })
          .first()
          .click()
        yield* page.getByRole("dialog", { name: first.title }).waitFor()
      })
    )

    it.effect("shows the running block on the home page and stops it there", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const space = yield* workSpace
        const task = yield* client.work.addTask({ payload: { title: Suite.unique("On the clock"), space: space.id } })
        yield* client.work.start({ payload: { task: task.id } })
        const page = yield* Suite.signedInPage
        yield* page.goto("/")

        yield* page.getByText(task.title).first().waitFor()
        yield* page.getByRole("button", { name: "Stop" }).click()
        yield* page.getByText("No block is running.").waitFor()
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

    it.effect("truncates a long deadline title on the home page and keeps its status in the card", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const due = yield* client.work.addTask({
          payload: { title: Suite.unique(`Long${" deadline".repeat(20)}`), deadline: yield* today }
        })
        const page = yield* Suite.signedInPage
        yield* Effect.promise(() => page.raw.setViewportSize({ width: 1280, height: 720 }))
        yield* page.goto("/")
        const title = page.getByText(due.title).first()
        yield* title.waitFor()

        const overflow = yield* Effect.promise(() =>
          title.raw.evaluate((text) => {
            const row = text.closest("button")!
            const card = text.closest('[data-slot="card"]')!
            return row.getBoundingClientRect().right - card.getBoundingClientRect().right
          })
        )
        assert.isAtMost(overflow, 0)
      })
    )

    it.effect("lists today's deadlines, what waits in review and today's calendar on the home page", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const due = yield* client.work.addTask({
          payload: { title: Suite.unique("Due today"), deadline: yield* today }
        })
        const page = yield* Suite.signedInPage
        yield* page.goto("/")

        yield* page.getByText("Due today", { exact: true }).waitFor()
        yield* page.getByText(due.title).first().waitFor()
        yield* page.getByText("Today in the calendar").waitFor()
        yield* page.getByText("Standup").first().waitFor()

        yield* page.getByText(due.title).first().click()
        yield* page.getByRole("dialog", { name: due.title }).waitFor()
      })
    )
  })
})
