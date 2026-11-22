import { describe, layer } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Calendar from "@ras/calendar"
import * as Time from "@ras/kernel/Time"
import * as Suite from "../src/Suite.ts"

const personal = Calendar.CalendarId.make(101)

const day = (days: number) => Effect.map(DateTime.now, (now) => Time.addDays(Time.pragueDateOf(now), days))
const at = (date: Time.PragueDate, clock: string) => Time.PragueLocal.make(`${date}T${clock}`)

const clock = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`

describe("the console's insights", () => {
  layer(Suite.layer, { excludeTestServices: true })("in Chromium", (it) => {
    it.effect("totals a ticked calendar's month and splits its work blocks by project and task", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const added = yield* client.work.addSpace({ payload: { name: Suite.unique("Space"), color: "#33aa66" } })
        const space = yield* client.work.changeSpace({ params: { id: added.id }, payload: { calendar: personal } })
        const project = yield* client.work.addProject({ payload: { name: Suite.unique("Website"), space: space.id } })
        const task = yield* client.work.addTask({
          payload: { title: Suite.unique("Landing page"), space: space.id, project: project.id }
        })
        const date = yield* day(-1)
        const block = yield* client.work.add({
          payload: { task: task.id, start: at(date, "07:00"), end: at(date, "08:30") }
        })

        const page = yield* Suite.signedInPage
        // The sample calendars take no writes, so the block's event reaches the Insights on the way to the page.
        yield* Effect.promise(() =>
          page.raw.route("**/calendar/insights?*", async (route) => {
            const response = await route.fetch()
            const insights = await response.json()
            await route.fulfill({
              response,
              json: {
                ...insights,
                taken: insights.taken + 90,
                workBlocks: { minutes: 90, blocks: [{ block: block.id, minutes: 90 }] }
              }
            })
          })
        )
        yield* page.goto(`/insights?date=${date}`)
        yield* page.getByText("No calendar is ticked").waitFor()

        yield* page.getByRole("checkbox", { name: "Personal" }).click()
        yield* page.waitForURL((url) => url.searchParams.get("calendar") === String(personal))
        const periods = page.getByRole("group", { name: "Period" })
        yield* periods.getByRole("button", { name: "Month" }).click()
        yield* page.waitForURL((url) => url.searchParams.get("period") === "month")

        const insights = yield* client.calendar.insights({ query: { kind: "month", date, calendar: personal } })
        yield* page
          .getByRole("region", { name: "Taken" })
          .getByText(clock(insights.taken + 90), { exact: true })
          .waitFor()
        const blocks = page.getByRole("region", { name: "Work blocks" })
        yield* blocks.getByRole("listitem").filter({ hasText: project.name }).getByText("1:30").waitFor()
        yield* blocks.getByRole("listitem").filter({ hasText: task.title }).getByText("1.5 h").waitFor()
      })
    )
  })
})
