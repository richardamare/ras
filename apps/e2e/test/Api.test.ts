import { assert, describe, layer } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Health from "@ras/api/health"
import * as Global from "@ras/global"
import * as Time from "@ras/kernel/Time"
import * as Suite from "../src/Suite.ts"

const OpenApi = Schema.Struct({
  info: Schema.Struct({ title: Schema.String }),
  paths: Schema.Record(Schema.String, Schema.Unknown)
})

describe("the HTTP API", () => {
  layer(Suite.layer, { excludeTestServices: true })("of a running ras", (it) => {
    it.effect("answers the health check with the instance serving it, and publishes its OpenAPI document", () =>
      Effect.gen(function* () {
        const { url } = yield* Suite.Server
        const first = yield* HttpClient.get(new URL("/health", url)).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(Health.Health))
        )
        const second = yield* HttpClient.get(new URL("/health", url)).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(Health.Health))
        )
        assert.isTrue(first.ok)
        assert.isNotEmpty(first.instance)
        assert.strictEqual(second.instance, first.instance)
        const document = yield* HttpClient.get(new URL("/openapi.json", url)).pipe(
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.flatMap(HttpClientResponse.schemaBodyJson(OpenApi))
        )
        assert.strictEqual(document.info.title, "ras")
        assert.isTrue("/work/tasks" in document.paths)
      })
    )

    it.effect("refuses a request without the owner's session with 401", () =>
      Effect.gen(function* () {
        const client = yield* Suite.client("")
        const error = yield* Effect.flip(client.global.whoami())
        assert.strictEqual(error._tag, "Unauthorized")
      })
    )

    it.effect("refuses a forged session cookie with 401", () =>
      Effect.gen(function* () {
        const client = yield* Suite.client("better-auth.session_token=forged")
        const error = yield* Effect.flip(client.work.tasks({ query: {} }))
        assert.strictEqual(error._tag, "Unauthorized")
      })
    )

    it.effect("answers whoami with the owner at the console", () =>
      Effect.gen(function* () {
        const client = yield* Suite.client(yield* Suite.sessionCookie)
        assert.deepStrictEqual(yield* client.global.whoami(), { channel: "Console", agent: null })
      })
    )

    it.effect("adds a task, comments on it, closes it and deletes it", () =>
      Effect.gen(function* () {
        const client = yield* Suite.client(yield* Suite.sessionCookie)
        const title = Suite.unique("Write the e2e suite")

        const added = yield* client.work.addTask({ payload: { title, priority: "high" } })
        assert.strictEqual(added.status, "todo")
        assert.strictEqual(added.priority, "high")

        const listed = yield* client.work.tasks({ query: {} })
        assert.isTrue(listed.some((task) => task.id === added.id))

        const commented = yield* client.work.comment({ params: { id: added.id }, payload: { text: "Started." } })
        assert.deepStrictEqual(
          commented.comments.map((comment) => comment.text),
          ["Started."]
        )

        const done = yield* client.work.changeTask({ params: { id: added.id }, payload: { status: "done" } })
        assert.strictEqual(done.status, "done")
        assert.isNotNull(done.closed)

        yield* client.work.deleteTask({ params: { id: added.id } })
        const gone = yield* Effect.flip(client.work.task({ params: { id: added.id } }))
        assert.strictEqual(gone._tag, "NotFound")
      })
    )

    it.effect("refuses a task with an empty title with 400", () =>
      Effect.gen(function* () {
        const { url } = yield* Suite.Server
        const response = yield* HttpClientRequest.post(new URL("/work/tasks", url)).pipe(
          HttpClientRequest.setHeader("cookie", yield* Suite.sessionCookie),
          HttpClientRequest.bodyJsonUnsafe({ title: "" }),
          HttpClient.execute
        )
        assert.strictEqual(response.status, 400)
      })
    )

    it.effect("adds an agent and archives it", () =>
      Effect.gen(function* () {
        const client = yield* Suite.client(yield* Suite.sessionCookie)
        const slug = Global.AgentSlug.make(`agent-${crypto.randomUUID().slice(0, 8)}`)
        const added = yield* client.global.addAgent({ payload: { slug, name: "E2E agent" } })
        assert.strictEqual(added.archived, false)
        const archived = yield* client.global.archiveAgent({ params: { slug } })
        assert.strictEqual(archived.archived, true)
        const agents = yield* client.global.agents()
        assert.isTrue(agents.some((agent) => agent.slug === slug && agent.archived))
      })
    )

    it.effect("serves the sample calendars and today's sample events", () =>
      Effect.gen(function* () {
        const client = yield* Suite.client(yield* Suite.sessionCookie)
        const calendars = yield* client.calendar.calendars({ query: {} })
        assert.deepStrictEqual(
          calendars.map((calendar) => calendar.name),
          ["Personal", "Work (copy)", "Work", "Family"]
        )
        const day = Time.pragueDateOf(yield* DateTime.now)
        // The calendar fills its cache in a sync it starts at boot, so the first answers can still be empty.
        const events = yield* client.calendar
          .events({ query: { from: Time.PragueLocal.make(`${day}T00:00`), to: Time.PragueLocal.make(`${day}T23:59`) } })
          .pipe(
            Effect.repeat({
              until: (found) => found.length > 0,
              schedule: Schedule.spaced(Duration.millis(250)),
              times: 40
            })
          )
        assert.includeMembers(
          events.map((event) => event.title),
          ["Standup", "Lunch"]
        )
      })
    )
  })
})
