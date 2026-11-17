import { assert, describe, layer } from "@effect/vitest"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Schedule from "effect/Schedule"
import * as Calendar from "@ras/calendar"
import * as Global from "@ras/global"
import type * as Browser from "../src/Browser.ts"
import * as Suite from "../src/Suite.ts"

const workCopy = Calendar.CalendarId.make(102)

/** Polls `read` until what it answers holds what `done` looks for. */
const becomes = <A, E, R>(read: Effect.Effect<A, E, R>, done: (found: A) => boolean) =>
  Effect.repeat(read, { until: done, schedule: Schedule.spaced(Duration.millis(100)), times: 50 })

/** The settings row that holds `content`. */
const row = (page: Browser.Page, content: Browser.Locator) =>
  page.locator("div.rounded-lg.border").filter({ has: content })

/** The row of the space whose name input holds `name`, once the page shows it. */
const spaceRow = (page: Browser.Page, name: string) =>
  Effect.gen(function* () {
    const rows = row(page, page.locator('input[aria-label="Name"]'))
    const index = (yield* rows.locator('input[aria-label="Name"]').inputValues).indexOf(name)
    if (index < 0) return yield* Effect.fail(new Error(`no space is named ${name}`))
    const found = rows.nth(index)
    return { input: found.getByLabel("Name", { exact: true }), row: found }
  }).pipe(Effect.retry({ schedule: Schedule.spaced(Duration.millis(100)), times: 50 }), Effect.orDie)

describe("the console's settings", () => {
  layer(Suite.layer, { excludeTestServices: true })("in Chromium", (it) => {
    it.effect("adds a space, renames it, gives it a calendar, makes it the default and archives another", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const original = (yield* client.work.spaces()).find((space) => space.default)!
        const name = Suite.unique("Clients")
        const page = yield* Suite.signedInPage
        yield* page.goto("/settings")

        yield* page.getByLabel("New space").fill(name)
        yield* page.getByRole("button", { name: "Add space" }).click()
        const added = yield* becomes(client.work.spaces(), (spaces) => spaces.some((space) => space.name === name))
        const space = added.find((found) => found.name === name)!

        const renamed = Suite.unique("Renamed")
        const { input } = yield* spaceRow(page, name)
        yield* input.fill(renamed)
        yield* input.blur
        yield* becomes(client.work.spaces(), (spaces) =>
          spaces.some((found) => found.id === space.id && found.name === renamed)
        )

        const { row: shown } = yield* spaceRow(page, renamed)
        yield* shown.getByRole("combobox", { name: "Calendar for work blocks" }).click()
        yield* page.getByRole("option", { name: "Personal" }).click()
        yield* becomes(client.work.spaces(), (spaces) =>
          spaces.some((found) => found.id === space.id && found.calendar === 101)
        )

        yield* shown.getByRole("button", { name: "Make default" }).click()
        yield* becomes(client.work.spaces(), (spaces) => spaces.some((found) => found.id === space.id && found.default))
        yield* client.work.changeSpace({ params: { id: original.id }, payload: { default: true } })

        yield* page.reload
        const { row: reloaded } = yield* spaceRow(page, renamed)
        yield* reloaded.getByRole("button", { name: "Archive" }).click()
        yield* becomes(client.work.spaces(), (spaces) =>
          spaces.some((found) => found.id === space.id && found.archived)
        )
        yield* reloaded.getByText("Archived").waitFor()
      })
    )

    it.effect("archives an agent", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const agent = yield* client.global.addAgent({
          payload: {
            slug: Global.AgentSlug.make(`settings-${crypto.randomUUID().slice(0, 8)}`),
            name: "Settings agent"
          }
        })
        const page = yield* Suite.signedInPage
        yield* page.goto("/settings")

        yield* row(page, page.getByText(agent.slug, { exact: true }))
          .getByRole("button", { name: "Archive" })
          .click()
        yield* becomes(client.global.agents(), (agents) =>
          agents.some((found) => found.slug === agent.slug && found.archived)
        )
      })
    )

    it.effect("turns a calendar off and on, and hides one from the calendar screen", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const page = yield* Suite.signedInPage
        yield* page.goto("/settings/calendars")
        const copyRow = row(page, page.getByText("Work (copy)", { exact: true }))

        yield* copyRow.getByLabel("On", { exact: true }).click()
        yield* becomes(client.calendar.calendars({ query: { includeDisabled: "true" } }), (calendars) =>
          calendars.some((calendar) => calendar.id === workCopy && !calendar.enabled)
        )
        yield* copyRow.getByLabel("On the calendar screen").waitFor()
        yield* copyRow.getByLabel("On", { exact: true }).click()
        yield* becomes(client.calendar.calendars({ query: {} }), (calendars) =>
          calendars.some((calendar) => calendar.id === workCopy)
        )

        const personalRow = row(page, page.getByText("Personal", { exact: true }))
        yield* personalRow.getByLabel("On the calendar screen").click()
        yield* personalRow.getByRole("checkbox", { name: "On the calendar screen", checked: false }).waitFor()
        yield* page.goto("/calendar")
        yield* page.getByRole("button", { name: /Calendars 2\/3/ }).waitFor()
      })
    )

    it.effect("shows every outside system as sample data", () =>
      Effect.gen(function* () {
        const page = yield* Suite.signedInPage
        yield* page.goto("/settings/connections")
        yield* page.getByText("iCloud Mail").waitFor()
        assert.strictEqual(yield* page.getByText("Sample data", { exact: true }).count, 4)
      })
    )

    it.effect("switches to the dark theme and signs out from the account menu", () =>
      Effect.gen(function* () {
        const page = yield* Suite.signedInPage
        yield* page.goto("/")
        yield* page.getByRole("button", { name: "Account menu" }).click()
        yield* page.getByRole("menuitem", { name: "Theme" }).click()
        yield* page.getByRole("menuitemradio", { name: "Dark" }).click()
        yield* page.locator("html.dark").waitFor({ state: "attached" })

        yield* page.getByRole("button", { name: "Account menu" }).click()
        yield* page.getByRole("menuitem", { name: "Sign out" }).click()
        yield* page.getByRole("button", { name: "Sign in" }).waitFor()
      })
    )
  })
})
