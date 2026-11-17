import { assert, describe, layer } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Schedule from "effect/Schedule"
import * as Calendar from "@ras/calendar"
import * as Time from "@ras/kernel/Time"
import * as Suite from "../src/Suite.ts"

const personal = Calendar.CalendarId.make(101)
const work = Calendar.CalendarId.make(201)

const day = (days: number) => Effect.map(DateTime.now, (now) => Time.addDays(Time.pragueDateOf(now), days))
const at = (date: Time.PragueDate, clock: string) => Time.PragueLocal.make(`${date}T${clock}`)

/** Polls `read` until what it answers holds what `done` looks for. */
const becomes = <A, E, R>(read: Effect.Effect<A, E, R>, done: (found: A) => boolean) =>
  Effect.repeat(read, { until: done, schedule: Schedule.spaced(Duration.millis(100)), times: 50 })

/** The sample's event titled `title` in `calendar` on `date`. */
const sampleEvent = (title: string, calendar: Calendar.CalendarId, date: Time.PragueDate) =>
  Effect.gen(function* () {
    const client = yield* Suite.owner
    const events = yield* client.calendar.events({ query: { from: at(date, "00:00"), to: at(date, "23:59") } })
    return events.find((event) => event.title === title && event.calendar === calendar)!
  })

const workSpace = Effect.gen(function* () {
  const client = yield* Suite.owner
  const space = yield* client.work.addSpace({ payload: { name: Suite.unique("Space"), color: "#33aa66" } })
  return yield* client.work.changeSpace({ params: { id: space.id }, payload: { calendar: personal } })
})

/** The blocks of `task` on `date`. */
const blocksOf = (task: string, date: Time.PragueDate) =>
  Effect.flatMap(Suite.owner, (client) =>
    Effect.map(client.work.blocks({ query: { from: at(date, "00:00"), to: at(date, "23:59") } }), (blocks) =>
      blocks.filter((block) => block.task === task)
    )
  )

describe("the console's calendar", () => {
  layer(Suite.layer, { excludeTestServices: true })("in Chromium", (it) => {
    it.effect("switches between the day, week and month views and steps through time", () =>
      Effect.gen(function* () {
        const page = yield* Suite.signedInPage
        yield* page.goto("/calendar")
        const views = page.getByRole("group", { name: "View" })
        yield* views.getByRole("button", { name: "Week", pressed: true }).waitFor()

        yield* views.getByRole("button", { name: "Month" }).click()
        yield* views.getByRole("button", { name: "Month", pressed: true }).waitFor()
        yield* page.waitForURL((url) => url.searchParams.get("view") === "month")
        yield* page.getByRole("button", { name: "Next month" }).click()
        yield* page.waitForURL((url) => url.searchParams.has("date"))
        yield* page.getByRole("button", { name: "Today" }).click()

        yield* views.getByRole("button", { name: "Day" }).click()
        yield* page.getByText("Standup").first().waitFor()
        yield* page.getByRole("button", { name: "Next day" }).click()
        yield* page.getByRole("button", { name: "Previous day" }).click()
        yield* page.getByRole("button", { name: "Today", disabled: true }).waitFor()
      })
    )

    it.effect("opens an event from its address, edits it, and refuses edits to a read-only one", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const date = yield* day(2)
        const dentist = yield* sampleEvent("Dentist", personal, date)
        const page = yield* Suite.signedInPage
        yield* page.goto(`/calendar?view=day&date=${date}&item=${dentist.id}`)

        yield* page.getByRole("button", { name: "Edit" }).click()
        const dialog = page.getByRole("dialog", { name: "Dentist" })
        yield* dialog.getByLabel("Location").fill("Second floor")
        yield* dialog.getByRole("button", { name: "Save" }).click()
        yield* dialog.waitFor({ state: "detached" })
        yield* becomes(
          client.calendar.event({ params: { id: dentist.id } }),
          (event) => event.location === "Second floor"
        )

        const standup = yield* sampleEvent("Standup", work, date)
        yield* page.goto(`/calendar?view=day&date=${date}&item=${standup.id}`)
        yield* page.getByText("Work takes no changes from ras").waitFor()
        yield* page.getByRole("button", { name: "Edit" }).waitFor({ state: "detached" })
      })
    )

    it.effect("wraps an event's long unbroken title and notes inside its popover", () =>
      Effect.gen(function* () {
        const date = yield* day(3)
        const gym = yield* sampleEvent("Gym", personal, date)
        const page = yield* Suite.signedInPage
        yield* Effect.promise(() =>
          page.raw.route("**/calendar/events?*", async (route) => {
            const response = await route.fetch()
            const events: ReadonlyArray<{ id: string }> = await response.json()
            await route.fulfill({
              response,
              json: events.map((event) =>
                event.id === gym.id
                  ? {
                      ...event,
                      title: `Sync-${"x".repeat(80)}`,
                      notes: `${"\\_".repeat(60)}\n\nJoin: https://teams.microsoft.com/meet/${"7".repeat(40)}?p=${"Q".repeat(40)}`
                    }
                  : event
              )
            })
          })
        )
        yield* page.goto(`/calendar?view=day&date=${date}&item=${gym.id}`)
        const popover = page.locator('[data-slot="popover-content"]')
        yield* popover.getByText("Join:", { exact: false }).waitFor()

        const overflow = yield* Effect.promise(() =>
          popover.raw.evaluate((content) => {
            const edge = content.getBoundingClientRect().right
            return Math.max(
              0,
              ...[...content.querySelectorAll("*")].map((each) => each.getBoundingClientRect().right - edge)
            )
          })
        )
        assert.strictEqual(overflow, 0)
      })
    )

    it.effect("answers an invitation from its popover", () =>
      Effect.gen(function* () {
        const date = yield* day(2)
        const review = yield* sampleEvent("Quarterly review", work, date)
        const page = yield* Suite.signedInPage
        yield* page.goto(`/calendar?view=day&date=${date}&item=${review.id}`)

        yield* page.getByText("Your reply:").waitFor()
        yield* page.getByRole("button", { name: "Maybe" }).click()
        yield* page.getByText("The change was not saved.").waitFor({ state: "detached" })
      })
    )

    it.effect(
      "keeps new events as drafts with Draft on, confirms one, discards the other, and turns Draft off each time",
      () =>
        Effect.gen(function* () {
          const client = yield* Suite.owner
          const page = yield* Suite.signedInPage
          yield* page.goto("/calendar")
          // The toolbar mounts again once the calendars load, which resets the toggle, so it is pressed after that.
          yield* page.getByRole("button", { name: "Calendars" }).waitFor()
          yield* page.getByRole("button", { name: "Draft", exact: true }).click()
          yield* page.getByRole("button", { name: "Draft", exact: true, pressed: true }).waitFor()

          const create = (title: string) =>
            Effect.gen(function* () {
              yield* page.getByRole("button", { name: "New event" }).click()
              const dialog = page.getByRole("dialog", { name: "New draft event" })
              yield* dialog.getByLabel("Title").fill(title)
              yield* dialog.getByRole("button", { name: "Create" }).click()
              yield* dialog.waitFor({ state: "detached" })
              yield* page.getByText(title).first().waitFor()
            })

          const kept = Suite.unique("Kept draft")
          yield* create(kept)
          yield* page.getByText("1 draft in view").waitFor()
          yield* page.getByRole("button", { name: "Confirm all drafts" }).click()
          yield* page.getByText(kept).first().waitFor({ state: "detached" })
          yield* page.getByRole("button", { name: "Draft", exact: true, pressed: false }).waitFor()

          yield* page.getByRole("button", { name: "Draft", exact: true }).click()
          const dropped = Suite.unique("Dropped draft")
          yield* create(dropped)
          yield* page.getByRole("button", { name: "Discard all drafts" }).click()
          yield* page
            .getByRole("dialog", { name: "Discard every draft?" })
            .getByRole("button", { name: "Discard all drafts" })
            .click()
          yield* page.getByText(dropped).first().waitFor({ state: "detached" })
          yield* page.getByRole("button", { name: "Draft", exact: true, pressed: false }).waitFor()

          const today = yield* day(0)
          const events = yield* client.calendar.events({
            query: { from: at(today, "00:00"), to: at(Time.addDays(today, 7), "00:00") }
          })
          assert.isFalse(events.some((event) => event.title === dropped))
        })
    )

    it.effect("creates a repeating event in a writable calendar from the new-event dialog", () =>
      Effect.gen(function* () {
        const page = yield* Suite.signedInPage
        yield* page.goto("/calendar")
        yield* page.getByRole("button", { name: "New event" }).click()
        const dialog = page.getByRole("dialog", { name: "New event" })
        yield* dialog.getByLabel("Title").fill(Suite.unique("Yoga"))
        yield* dialog.getByRole("combobox", { name: "Repeat" }).click()
        yield* page.getByRole("option", { name: "Every day" }).click()
        yield* dialog.getByRole("button", { name: "Create" }).click()
        yield* dialog.waitFor({ state: "detached" })
        yield* page.getByText("The change was not saved.").waitFor({ state: "detached" })
      })
    )

    it.effect("hides a calendar's events with the calendar filter", () =>
      Effect.gen(function* () {
        const page = yield* Suite.signedInPage
        yield* page.goto(`/calendar?view=day&date=${yield* day(1)}`)
        yield* page.getByText("Lunch").first().waitFor()

        yield* page.getByRole("button", { name: "Calendars" }).click()
        yield* page.getByRole("checkbox", { name: "Personal" }).click()
        yield* page.getByText("Lunch").first().waitFor({ state: "detached" })
        yield* page.getByRole("button", { name: /Calendars 2\/3/ }).waitFor()

        yield* page.getByRole("checkbox", { name: "Personal" }).click()
        yield* page.getByText("Lunch").first().waitFor()
      })
    )

    it.effect("fills the column of a day a busy all-day event takes, and leaves a free one's day as it is", () =>
      Effect.gen(function* () {
        const date = yield* day(5)
        const page = yield* Suite.signedInPage
        const filled = Effect.gen(function* () {
          yield* page.goto(`/calendar?view=week&date=${date}`)
          yield* page.getByText("Holiday").first().waitFor()
          return yield* Effect.promise(() =>
            page.raw
              .locator(`[data-day-column="${date}"]`)
              .evaluate((column) => column.classList.contains("calendar-day-fill"))
          )
        })
        assert.isFalse(yield* filled)

        // The sample's Holiday is free, so the API's answer marks it busy on its way to the page.
        yield* Effect.promise(() =>
          page.raw.route("**/calendar/events?*", async (route) => {
            const response = await route.fetch()
            const events: ReadonlyArray<{ readonly title: string }> = await response.json()
            await route.fulfill({
              response,
              json: events.map((event) => (event.title === "Holiday" ? { ...event, showAs: "busy" } : event))
            })
          })
        )
        assert.isTrue(yield* filled)
      })
    )

    it.effect("plans a task by dragging it from the planner onto a day", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const space = yield* workSpace
        const task = yield* client.work.addTask({ payload: { title: Suite.unique("Dropped in"), space: space.id } })
        const date = yield* day(60)
        const page = yield* Suite.signedInPage
        yield* page.goto(`/calendar?view=day&date=${date}`)

        yield* page.getByRole("button", { name: "Plan tasks" }).click()
        const planner = page.getByRole("complementary", { name: "Plan tasks" })
        yield* planner.getByLabel("Search tasks").fill(task.title)
        yield* planner.getByText(task.title).dragTo(page.locator(`[data-day-column="${date}"]`))

        const planned = yield* becomes(blocksOf(task.id, date), (blocks) => blocks.length === 1)
        assert.strictEqual(planned[0]!.state, "planned")
      })
    )

    it.effect("starts work on a block's task from its popover, and stops the running block there", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const space = yield* workSpace
        const task = yield* client.work.addTask({ payload: { title: Suite.unique("Kicked off"), space: space.id } })
        const date = yield* day(62)
        const block = yield* client.work.plan({ payload: { task: task.id, start: at(date, "09:00"), minutes: 60 } })
        const page = yield* Suite.signedInPage
        yield* page.goto(`/calendar?view=day&date=${date}&item=${block.id}`)

        yield* page.getByText("Planned work block").waitFor()
        yield* page.getByRole("button", { name: "Start" }).click()
        const running = yield* becomes(client.work.running(), (found) => found?.task === task.id)

        yield* page.goto(`/calendar?view=day&date=${yield* day(0)}&item=${running!.id}`)
        yield* page.getByRole("button", { name: "Stop" }).click()
        yield* becomes(client.work.running(), (found) => found === null)
        // A stopped block lasts a minute at least; removing it frees that minute for the other tests' timers.
        yield* Effect.forEach(yield* blocksOf(task.id, yield* day(0)), (one) =>
          client.work.remove({ params: { id: one.id } })
        )
      })
    )

    it.effect("moves a block to a typed time, opens its task, and removes it from its popover", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const space = yield* workSpace
        const task = yield* client.work.addTask({ payload: { title: Suite.unique("Blocked out"), space: space.id } })
        const date = yield* day(61)
        const block = yield* client.work.add({
          payload: { task: task.id, start: at(date, "09:00"), end: at(date, "10:00") }
        })
        const page = yield* Suite.signedInPage
        yield* page.goto(`/calendar?view=day&date=${date}&item=${block.id}`)

        yield* page.getByText("Planned work block").waitFor()
        yield* page.getByRole("button", { name: "Move", exact: true }).click()
        const dialog = page.getByRole("dialog", { name: "Move work block" })
        yield* dialog.getByLabel("Start").fill("13:00")
        yield* dialog.getByLabel("End").fill("14:30")
        yield* dialog.getByRole("button", { name: "Move" }).click()
        yield* becomes(blocksOf(task.id, date), (blocks) => blocks[0]?.start === at(date, "13:00"))

        yield* page.goto(`/calendar?view=day&date=${date}&item=${block.id}`)
        yield* page.getByRole("button", { name: "Open task" }).click()
        yield* page.getByRole("dialog", { name: task.title }).waitFor()

        yield* page.goto(`/calendar?view=day&date=${date}&item=${block.id}`)
        yield* page.getByRole("button", { name: "Remove block" }).click()
        yield* becomes(blocksOf(task.id, date), (blocks) => blocks.length === 0)
      })
    )
  })
})
