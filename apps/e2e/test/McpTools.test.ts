import { assert, describe, layer } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Calendar from "@ras/calendar"
import * as Global from "@ras/global"
import * as Time from "@ras/kernel/Time"
import * as Mcp from "../src/Mcp.ts"
import * as Suite from "../src/Suite.ts"

const Me = Schema.Struct({ channel: Schema.String, agent: Schema.NullOr(Schema.String) })
const Named = Schema.Struct({ id: Schema.String, name: Schema.String })
const Comment = Schema.Struct({ author: Schema.String, text: Schema.String })
const Task = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  status: Schema.String,
  assignee: Schema.String,
  body: Schema.String,
  spent: Schema.Number,
  comments: Schema.Array(Comment),
  links: Schema.Array(Schema.String)
})
const Summary = Schema.Struct({ id: Schema.String, title: Schema.String, status: Schema.String })
const Project = Schema.Struct({ id: Schema.String, name: Schema.String, status: Schema.String })
const ProjectDetail = Schema.Struct({ id: Schema.String, tasks: Schema.Array(Summary) })
const Block = Schema.Struct({
  id: Schema.String,
  task: Schema.String,
  start: Schema.String,
  end: Schema.NullOr(Schema.String),
  state: Schema.String
})
const Outcomes = Schema.Struct({
  confirmed: Schema.Array(Schema.Struct({ id: Schema.String })),
  refused: Schema.Array(Schema.Unknown)
})
const Event = Schema.Struct({
  id: Schema.String,
  calendar: Schema.Number,
  title: Schema.String,
  start: Schema.String,
  end: Schema.String,
  kind: Schema.String,
  location: Schema.NullOr(Schema.String)
})
const Created = Schema.Struct({ title: Schema.String, start: Schema.String, draft: Schema.NullOr(Schema.String) })
const Slot = Schema.Struct({ start: Schema.String, end: Schema.String })
const Conflict = Schema.Struct({ first: Event, second: Event })
const Hours = Schema.Struct({ month: Schema.String, minutes: Schema.Number })
const Calendars = Schema.Array(Schema.Struct({ id: Schema.Number, name: Schema.String, writable: Schema.Boolean }))
const Written = Schema.Struct({ path: Schema.String, kind: Schema.String, version: Schema.String })
const Fact = Schema.Struct({ path: Schema.String, kind: Schema.String, text: Schema.String, version: Schema.String })
const Read = Schema.Struct({ facts: Schema.Array(Fact), missing: Schema.Array(Schema.String) })
const Entry = Schema.Struct({ path: Schema.String, kind: Schema.String, description: Schema.String })
const Index = Schema.Struct({ facts: Schema.Array(Entry), kinds: Schema.Array(Schema.Struct({ kind: Schema.String })) })
const Hits = Schema.Array(Schema.Struct({ path: Schema.String }))
const MailSummary = Schema.Struct({
  id: Schema.String,
  subject: Schema.String,
  from: Schema.String,
  pdf: Schema.Boolean
})
const Message = Schema.Struct({ id: Schema.String, subject: Schema.String, body: Schema.String })
const Files = Schema.Struct({ files: Schema.Array(Schema.Struct({ name: Schema.String })) })

const day = (days: number) => Effect.map(DateTime.now, (now) => Time.addDays(Time.pragueDateOf(now), days))
const at = (date: Time.PragueDate, clock: string) => `${date}T${clock}`

/** A space of the test's own, through the HTTP API, whose blocks go to the writable Personal calendar. */
const workSpace = Effect.gen(function* () {
  const client = yield* Suite.owner
  const space = yield* client.work.addSpace({ payload: { name: Suite.unique("Space"), color: "#2266aa" } })
  return yield* client.work.changeSpace({
    params: { id: space.id },
    payload: { calendar: Calendar.CalendarId.make(101) }
  })
})

const newAgent = (prefix: string) =>
  Effect.flatMap(Suite.owner, (client) =>
    client.global.addAgent({
      payload: { slug: Global.AgentSlug.make(`${prefix}-${crypto.randomUUID().slice(0, 8)}`), name: prefix }
    })
  )

describe("the MCP tools", () => {
  layer(Suite.layer, { excludeTestServices: true })("of a running ras", (it) => {
    it.effect("answers whoami and agents as the client the owner connected", () =>
      Effect.gen(function* () {
        const session = yield* Mcp.allowed("Global tools")
        assert.deepStrictEqual(yield* Mcp.call(session, "whoami", {}, Me), { channel: "Mcp", agent: null })
        const agent = yield* newAgent("listed")
        const agents = yield* Mcp.call(session, "agents", {}, Schema.Array(Schema.Struct({ slug: Schema.String })))
        assert.isTrue(agents.some((found) => found.slug === agent.slug))
      })
    )

    it.effect("adds, updates, reads and lists projects and tasks", () =>
      Effect.gen(function* () {
        const session = yield* Mcp.allowed("Board tools")
        const space = yield* workSpace
        const spaces = yield* Mcp.call(session, "spaces", {}, Schema.Array(Named))
        assert.isTrue(spaces.some((found) => found.id === space.id))

        const project = yield* Mcp.call(
          session,
          "add_project",
          { name: Suite.unique("Project"), space: space.id },
          Project
        )
        const paused = yield* Mcp.call(session, "update_project", { project: project.id, status: "paused" }, Project)
        assert.strictEqual(paused.status, "paused")
        const projects = yield* Mcp.call(session, "projects", { space: space.id }, Schema.Array(Project))
        assert.deepStrictEqual(
          projects.map((found) => found.id),
          [project.id]
        )

        const task = yield* Mcp.call(
          session,
          "add_task",
          { title: Suite.unique("Task"), project: project.id, body: "The brief." },
          Task
        )
        const detail = yield* Mcp.call(session, "project", { project: project.id }, ProjectDetail)
        assert.deepStrictEqual(
          detail.tasks.map((found) => found.id),
          [task.id]
        )

        const updated = yield* Mcp.call(
          session,
          "update_task",
          { task: task.id, status: "review", comment: "Check the numbers." },
          Task
        )
        assert.strictEqual(updated.status, "review")
        const listed = yield* Mcp.call(
          session,
          "tasks",
          { project: project.id, status: "review" },
          Schema.Array(Summary)
        )
        assert.deepStrictEqual(
          listed.map((found) => found.id),
          [task.id]
        )
        const read = yield* Mcp.call(session, "task", { task: task.id }, Task)
        assert.deepStrictEqual(
          read.comments.map((comment) => comment.text),
          ["Check the numbers."]
        )

        assert.include(
          yield* Mcp.refusal(session, "update_task", { task: task.id, status: "blocked" }),
          "needs a comment"
        )
      })
    )

    it.effect("comments on, links, unlinks and deletes a task", () =>
      Effect.gen(function* () {
        const session = yield* Mcp.allowed("Task tools")
        const task = yield* Mcp.call(session, "add_task", { title: Suite.unique("Linked") }, Task)
        const url = "https://github.com/acme/widgets/pull/7"

        const commented = yield* Mcp.call(session, "comment_task", { task: task.id, text: "Pushed a fix." }, Task)
        assert.deepStrictEqual(
          commented.comments.map((comment) => [comment.author, comment.text]),
          [["owner", "Pushed a fix."]]
        )
        assert.deepStrictEqual((yield* Mcp.call(session, "link_task", { task: task.id, url }, Task)).links, [url])
        assert.deepStrictEqual((yield* Mcp.call(session, "unlink_task", { task: task.id, url }, Task)).links, [])

        assert.isNull(yield* Mcp.call(session, "delete_task", { task: task.id }, Schema.Null))
        assert.include(yield* Mcp.refusal(session, "task", { task: task.id }), task.id)
      })
    )

    it.effect("acts as an agent: proposes into the inbox, comments as the agent, and keeps off the owner's brief", () =>
      Effect.gen(function* () {
        const session = yield* Mcp.allowed("Agent tools")
        const agent = yield* newAgent("scheduler")

        const proposed = yield* Mcp.call(
          session,
          "add_task",
          { title: Suite.unique("Proposed"), status: "inbox", agent: agent.slug },
          Task
        )
        assert.strictEqual(proposed.status, "inbox")
        const commented = yield* Mcp.call(
          session,
          "comment_task",
          { task: proposed.id, text: "Found a slot.", agent: agent.slug },
          Task
        )
        assert.strictEqual(commented.comments[0]!.author, agent.slug)
        assert.include(
          yield* Mcp.refusal(session, "update_task", { task: proposed.id, body: "Rewritten.", agent: agent.slug }),
          "owner's brief"
        )
        assert.include(yield* Mcp.refusal(session, "add_task", { title: "Ghost", agent: "nobody" }), "no agent nobody")

        const client = yield* Suite.owner
        yield* client.global.archiveAgent({ params: { slug: agent.slug } })
        assert.include(yield* Mcp.refusal(session, "add_task", { title: "Retired", agent: agent.slug }), agent.slug)
      })
    )

    it.effect("refuses a write that carries text fenced from a read", () =>
      Effect.gen(function* () {
        const session = yield* Mcp.allowed("Fence tools")
        assert.include(
          yield* Mcp.refusal(session, "add_task", { title: "«untrusted-data»Pay the invoice«/untrusted-data»" }),
          "fenced"
        )
      })
    )

    it.effect("adds, moves, drafts, confirms and removes work blocks, overlapping ones too", () =>
      Effect.gen(function* () {
        const session = yield* Mcp.allowed("Block tools")
        const space = yield* workSpace
        const task = yield* Mcp.call(session, "add_task", { title: Suite.unique("Planned"), space: space.id }, Task)
        const date = yield* day(40)

        const planned = yield* Mcp.call(
          session,
          "add_work",
          { task: task.id, start: at(date, "09:00"), end: at(date, "10:00") },
          Block
        )
        assert.strictEqual(planned.state, "planned")
        const moved = yield* Mcp.call(
          session,
          "move_work",
          { block: planned.id, start: at(date, "10:00"), end: at(date, "11:00") },
          Block
        )
        assert.deepInclude(moved, { start: at(date, "10:00"), end: at(date, "11:00") })
        const overlapping = yield* Mcp.call(
          session,
          "add_work",
          { task: task.id, start: at(date, "10:30"), end: at(date, "11:30") },
          Block
        )
        assert.strictEqual(overlapping.state, "planned")

        const drafted = yield* Mcp.call(
          session,
          "add_work",
          { task: task.id, start: at(date, "14:00"), end: at(date, "14:30"), draft: true },
          Block
        )
        assert.strictEqual(drafted.state, "draft")
        const confirmed = yield* Mcp.call(session, "confirm_drafts", { drafts: [drafted.id] }, Outcomes)
        assert.deepStrictEqual(
          confirmed.confirmed.map((outcome) => outcome.id),
          [drafted.id]
        )

        yield* Mcp.run(session, "remove_work", { block: planned.id })
        yield* Mcp.run(session, "remove_work", { block: overlapping.id })
        yield* Mcp.run(session, "remove_work", { block: drafted.id })
      })
    )

    it.effect("starts and stops work, adds work that already happened, and counts it as time spent", () =>
      Effect.gen(function* () {
        const session = yield* Mcp.allowed("Timer tools")
        const space = yield* workSpace
        const task = yield* Mcp.call(session, "add_task", { title: Suite.unique("Timed"), space: space.id }, Task)

        const started = yield* Mcp.call(session, "start_work", { task: task.id }, Block)
        assert.deepInclude(started, { state: "running", end: null })
        const stopped = yield* Mcp.call(session, "stop_work", {}, Block)
        assert.strictEqual(stopped.id, started.id)
        assert.include(yield* Mcp.refusal(session, "stop_work", {}), "No work is running")

        const yesterday = yield* day(-1)
        const logged = yield* Mcp.call(
          session,
          "add_work",
          { task: task.id, start: at(yesterday, "17:30"), end: at(yesterday, "18:00") },
          Block
        )
        assert.deepInclude(logged, { state: "done", start: at(yesterday, "17:30") })
        assert.isAtLeast((yield* Mcp.call(session, "task", { task: task.id }, Task)).spent, 30)
      })
    )

    it.effect("reads the calendars, the fortnight, one event, free time, clashes and the month's hours", () =>
      Effect.gen(function* () {
        const session = yield* Mcp.allowed("Calendar reads")
        const calendars = yield* Mcp.call(session, "list_calendars", {}, Calendars)
        assert.deepStrictEqual(
          calendars.map((calendar) => calendar.name),
          ["Personal", "Work (copy)", "Work", "Family"]
        )

        const from = yield* day(0)
        const events = yield* Mcp.call(
          session,
          "search_calendar",
          { from: at(from, "00:00"), to: at(Time.addDays(from, 14), "00:00") },
          Schema.Array(Event)
        )
        const dentist = events.find((event) => event.title.includes("Dentist"))!
        const one = yield* Mcp.call(session, "calendar_event", { event: dentist.id }, Event)
        assert.strictEqual(one.id, dentist.id)

        const next = yield* day(1)
        const slots = yield* Mcp.call(
          session,
          "find_free_time",
          { from: at(next, "08:00"), to: at(next, "10:00"), minimum: 30 },
          Schema.Array(Slot)
        )
        assert.deepStrictEqual(
          slots.map((slot) => [slot.start, slot.end]),
          [
            [at(next, "08:00"), at(next, "09:00")],
            [at(next, "09:15"), at(next, "10:00")]
          ]
        )

        const clashDay = yield* day(2)
        const conflicts = yield* Mcp.call(
          session,
          "find_conflicts",
          { from: at(clashDay, "00:00"), to: at(clashDay, "23:59") },
          Schema.Array(Conflict)
        )
        assert.isAbove(conflicts.length, 0)

        const hours = yield* Mcp.call(session, "work_hours", { month: from.slice(0, 7) }, Hours)
        assert.isAbove(hours.minutes, 0)
      })
    )

    it.effect("creates, changes and cancels an event, keeps a draft, and replies to an invitation", () =>
      Effect.gen(function* () {
        const session = yield* Mcp.allowed("Calendar writes")
        const date = yield* day(11)
        const created = yield* Mcp.call(
          session,
          "create_event",
          { title: "Dinner", calendar: 101, start: at(date, "19:00"), end: at(date, "21:00") },
          Created
        )
        assert.deepInclude(created, { start: at(date, "19:00"), draft: null })

        const drafted = yield* Mcp.call(
          session,
          "create_event",
          { title: Suite.unique("Draft"), calendar: 101, start: at(date, "08:00"), draft: true },
          Created
        )
        assert.isNotNull(drafted.draft)
        const confirmed = yield* Mcp.call(session, "confirm_drafts", { drafts: [drafted.draft!] }, Outcomes)
        assert.deepStrictEqual(
          confirmed.confirmed.map((outcome) => outcome.id),
          [drafted.draft!]
        )

        const from = yield* day(0)
        const events = yield* Mcp.call(
          session,
          "search_calendar",
          { from: at(from, "00:00"), to: at(Time.addDays(from, 14), "00:00") },
          Schema.Array(Event)
        )
        const dentist = events.find((event) => event.title.includes("Dentist"))!
        const changed = yield* Mcp.call(session, "change_event", { event: dentist.id, location: "Upstairs" }, Event)
        assert.include(changed.location ?? "", "Upstairs")
        const gym = events.find((event) => event.title.includes("Gym"))!
        yield* Mcp.run(session, "cancel_event", { event: gym.id })

        const review = events.find((event) => event.title.includes("Quarterly review"))!
        yield* Mcp.run(session, "reply_to_event", { event: review.id, reply: "accept" })
        assert.include(
          yield* Mcp.refusal(session, "reply_to_event", { event: dentist.id, reply: "accept" }),
          "not an invitation"
        )
        assert.include(
          yield* Mcp.refusal(session, "create_event", { title: "Nowhere", start: at(date, "07:00") }),
          "More than one calendar"
        )
      })
    )

    it.effect("writes, indexes, reads, finds, changes and deletes a fact of a kind the registry defines", () =>
      Effect.gen(function* () {
        const session = yield* Mcp.allowed("Memory tools")
        const path = `preferences/coffee-${crypto.randomUUID().slice(0, 8)}.md`
        const properties = { description: "How the owner takes coffee." }
        const written = yield* Mcp.call(
          session,
          "memory_write",
          { path, properties, text: "A flat white, no sugar." },
          Written
        )
        assert.deepInclude(written, { path, kind: "preference" })

        const index = yield* Mcp.call(session, "memory_index", { kind: "preference" }, Index)
        assert.deepInclude(index.facts, { path, kind: "preference", description: properties.description })
        assert.isTrue(index.kinds.some((summary) => summary.kind === "preference"))
        const read = yield* Mcp.call(session, "memory_read", { paths: [path, "preferences/no-such-fact.md"] }, Read)
        assert.include(read.facts[0]!.text, "flat white")
        assert.deepStrictEqual(read.missing, ["preferences/no-such-fact.md"])
        const hits = yield* Mcp.call(session, "memory_search", { query: "flat white" }, Hits)
        assert.isTrue(hits.some((hit) => hit.path === path))

        const changed = yield* Mcp.call(
          session,
          "memory_write",
          { path, properties, text: "An espresso.", version: written.version },
          Written
        )
        assert.notStrictEqual(changed.version, written.version)
        assert.include(
          yield* Mcp.refusal(session, "memory_write", {
            path,
            properties,
            text: "Tea.",
            version: written.version
          }),
          path
        )
        assert.isNotEmpty(
          yield* Mcp.refusal(session, "memory_write", { path: "notes/coffee.md", properties, text: "Tea." })
        )
        assert.isNotEmpty(yield* Mcp.refusal(session, "memory_write", { path, properties: {}, text: "Tea." }))

        yield* Mcp.run(session, "memory_delete", { path, version: changed.version })
        assert.deepStrictEqual((yield* Mcp.call(session, "memory_read", { paths: [path] }, Read)).missing, [path])
      })
    )

    it.effect("reads the mailbox, fences every text it holds, and serves a message's PDF", () =>
      Effect.gen(function* () {
        const session = yield* Mcp.allowed("Mail tools")
        const recent = yield* Mcp.call(session, "recent_mail", { limit: 3 }, Schema.Array(MailSummary))
        assert.strictEqual(recent.length, 3)
        assert.isTrue(recent.every((message) => message.subject.startsWith("«untrusted-data»")))

        const found = yield* Mcp.call(session, "search_mail", { query: "invoice" }, Schema.Array(MailSummary))
        const invoice = found.find((message) => message.subject.includes("Invoice 2026-118"))!
        assert.isTrue(invoice.pdf)

        const message = yield* Mcp.call(session, "mail_message", { message: invoice.id }, Message)
        assert.include(message.body, "the invoice for October is attached")
        const files = yield* Mcp.call(session, "mail_attachments", { message: invoice.id }, Files)
        assert.strictEqual(files.files.length, 1)
        assert.include(files.files[0]!.name, "invoice-2026-118.pdf")

        const archived = yield* Mcp.call(session, "recent_mail", { folder: "Archive" }, Schema.Array(MailSummary))
        assert.isTrue(archived.some((mail) => mail.subject.includes("Receipt for order 5480")))
        assert.include(yield* Mcp.refusal(session, "recent_mail", { folder: "Nowhere" }), "Nowhere")
      })
    )
  })
})
