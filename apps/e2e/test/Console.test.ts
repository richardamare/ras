import { assert, describe, layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Global from "@ras/global"
import * as Ras from "../src/Ras.ts"
import * as Suite from "../src/Suite.ts"

describe("the console", () => {
  layer(Suite.layer, { excludeTestServices: true })("in Chromium", (it) => {
    it.effect("shows the sign-in in place of a page, refuses a wrong password and opens the page after", () =>
      Effect.gen(function* () {
        const page = yield* Suite.page
        yield* page.goto("/board")

        yield* page.getByLabel("Email").fill(Ras.owner.email)
        yield* page.getByLabel("Password").fill("not-the-password")
        yield* page.getByRole("button", { name: "Sign in" }).click()
        yield* page.getByText("The email or the password is wrong.").waitFor()

        yield* page.getByLabel("Password").fill(Ras.owner.password)
        yield* page.getByRole("button", { name: "Sign in" }).click()
        yield* page.getByRole("heading", { name: "Board", level: 1 }).waitFor()
        assert.strictEqual((yield* page.url).pathname, "/board")
      })
    )

    it.effect("moves between the pages from the sidebar", () =>
      Effect.gen(function* () {
        const page = yield* Suite.signedInPage
        yield* page.goto("/")
        const sidebar = page.locator("[data-sidebar=sidebar]")

        yield* Effect.forEach(["Tasks", "Board", "Projects"], (name) =>
          Effect.andThen(
            sidebar.getByRole("link", { name, exact: true }).click(),
            page.getByRole("heading", { name, level: 1 }).waitFor()
          )
        )
        yield* sidebar.getByRole("button", { name: "Settings" }).click()
        yield* sidebar.getByRole("link", { name: "General", exact: true }).click()
        yield* page.getByText("MCP clients").waitFor()
        assert.strictEqual((yield* page.url).pathname, "/settings")
        yield* sidebar.getByRole("link", { name: "Calendars", exact: true }).click()
        yield* page.getByText("On the calendar screen").first().waitFor()
        assert.strictEqual((yield* page.url).pathname, "/settings/calendars")
        yield* sidebar.getByRole("link", { name: "Connections", exact: true }).click()
        yield* page.getByText("Sample data").first().waitFor()
        assert.strictEqual((yield* page.url).pathname, "/settings/connections")
      })
    )

    it.effect("creates a task from the new-task dialog and puts it on the board", () =>
      Effect.gen(function* () {
        const page = yield* Suite.signedInPage
        const title = Suite.unique("Buy a new keyboard")
        yield* page.goto("/board")

        yield* page.getByRole("button", { name: "New task" }).click()
        const dialog = page.getByRole("dialog")
        yield* dialog.getByLabel("Task").fill(title)
        yield* dialog.getByRole("button", { name: "Create task" }).click()
        yield* page.getByText(`${title} is on the board.`).waitFor()
        yield* page.getByRole("main").getByText(title).first().waitFor()

        const client = yield* Suite.client(yield* Suite.sessionCookie)
        const tasks = yield* client.work.tasks({ query: {} })
        assert.deepStrictEqual(
          tasks.filter((task) => task.title === title).map((task) => task.status),
          ["todo"]
        )
      })
    )

    it.effect("adds an agent in the settings", () =>
      Effect.gen(function* () {
        const page = yield* Suite.signedInPage
        const slug = Global.AgentSlug.make(`console-${crypto.randomUUID().slice(0, 8)}`)
        yield* page.goto("/settings")

        yield* page.getByLabel("slug").fill(slug)
        yield* page.getByLabel("Name", { exact: true }).last().fill("Console agent")
        yield* page.getByRole("button", { name: "Add agent" }).click()
        yield* page.getByText(slug).waitFor()

        const client = yield* Suite.client(yield* Suite.sessionCookie)
        const agents = yield* client.global.agents()
        assert.isTrue(agents.some((agent) => agent.slug === slug && agent.name === "Console agent"))
      })
    )

    it.effect("shows today's sample events in the calendar", () =>
      Effect.gen(function* () {
        const page = yield* Suite.signedInPage
        yield* page.goto("/calendar")
        yield* page.getByText("Standup").first().waitFor()
        yield* page.getByText("Lunch").first().waitFor()
      })
    )
  })
})
