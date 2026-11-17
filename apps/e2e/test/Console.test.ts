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
        yield* Suite.use(() => page.goto("/board"))

        yield* Suite.use(() => page.getByLabel("Email").fill(Ras.owner.email))
        yield* Suite.use(() => page.getByLabel("Password").fill("not-the-password"))
        yield* Suite.use(() => page.getByRole("button", { name: "Sign in" }).click())
        yield* Suite.use(() => page.getByText("The email or the password is wrong.").waitFor())

        yield* Suite.use(() => page.getByLabel("Password").fill(Ras.owner.password))
        yield* Suite.use(() => page.getByRole("button", { name: "Sign in" }).click())
        yield* Suite.use(() => page.getByRole("heading", { name: "Board", level: 1 }).waitFor())
        assert.strictEqual(new URL(page.url()).pathname, "/board")
      })
    )

    it.effect("moves between the pages from the sidebar", () =>
      Effect.gen(function* () {
        const page = yield* Suite.signedInPage
        yield* Suite.use(() => page.goto("/"))
        const sidebar = page.locator("[data-sidebar=sidebar]")

        yield* Effect.forEach(["Tasks", "Board", "Projects"], (name) =>
          Effect.andThen(
            Suite.use(() => sidebar.getByRole("link", { name, exact: true }).click()),
            Suite.use(() => page.getByRole("heading", { name, level: 1 }).waitFor())
          )
        )
        yield* Suite.use(() => sidebar.getByRole("link", { name: "Settings", exact: true }).click())
        yield* Suite.use(() => page.getByText("MCP clients").waitFor())
        assert.strictEqual(new URL(page.url()).pathname, "/settings")
      })
    )

    it.effect("creates a task from the new-task dialog and puts it on the board", () =>
      Effect.gen(function* () {
        const page = yield* Suite.signedInPage
        const title = Suite.unique("Buy a new keyboard")
        yield* Suite.use(() => page.goto("/board"))

        yield* Suite.use(() => page.getByRole("button", { name: "New task" }).click())
        const dialog = page.getByRole("dialog")
        yield* Suite.use(() => dialog.getByLabel("Task").fill(title))
        yield* Suite.use(() => dialog.getByRole("button", { name: "Create task" }).click())
        yield* Suite.use(() => page.getByText(`${title} is on the board.`).waitFor())
        yield* Suite.use(() => page.getByRole("main").getByText(title).first().waitFor())

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
        yield* Suite.use(() => page.goto("/settings"))

        yield* Suite.use(() => page.getByLabel("slug").fill(slug))
        yield* Suite.use(() => page.getByLabel("Name", { exact: true }).last().fill("Console agent"))
        yield* Suite.use(() => page.getByRole("button", { name: "Add agent" }).click())
        yield* Suite.use(() => page.getByText(slug).waitFor())

        const client = yield* Suite.client(yield* Suite.sessionCookie)
        const agents = yield* client.global.agents()
        assert.isTrue(agents.some((agent) => agent.slug === slug && agent.name === "Console agent"))
      })
    )

    it.effect("shows today's sample events in the calendar", () =>
      Effect.gen(function* () {
        const page = yield* Suite.signedInPage
        yield* Suite.use(() => page.goto("/calendar"))
        yield* Suite.use(() => page.getByText("Standup").first().waitFor())
        yield* Suite.use(() => page.getByText("Lunch").first().waitFor())
      })
    )
  })
})
