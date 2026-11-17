import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as SqlClient from "effect/sql/SqlClient"
import * as Calendar from "@ras/calendar"
import * as Global from "@ras/global"
import * as Errors from "@ras/kernel/Errors"
import * as Id from "@ras/kernel/Id"
import * as Time from "@ras/kernel/Time"
import * as Domain from "./Domain.ts"
import * as Store from "./Store.ts"

type Write<A> = Effect.Effect<
  A,
  Errors.Refused | Errors.NotFound | Errors.Invalid | Errors.SourceFailed,
  Global.CurrentActor
>

/** A started block's event first runs this long; stopping it sets the real end. */
const runningEvent = 15 * 60_000
/** A start this close behind now still counts as now. */
const grace = 60_000

const refuse = (code: string, reason: string, instead: string) =>
  Effect.fail(new Errors.Refused({ code: `work.block.${code}`, reason, instead }))

const millis = DateTime.toEpochMillis

export const stateOf = (row: Store.BlockRow, now: DateTime.Utc): Domain.BlockState =>
  Option.isNone(row.event)
    ? "draft"
    : Option.match(row.end, {
        onNone: () => "running",
        onSome: (end) => (DateTime.isLessThanOrEqualTo(end, now) ? "done" : "planned")
      })

export const view = (row: Store.BlockRow, now: DateTime.Utc) =>
  new Domain.Block({
    id: row.id,
    task: row.task,
    title: row.title,
    calendar: row.calendar,
    start: Time.toPragueLocal(row.start),
    end: Option.getOrNull(Option.map(row.end, Time.toPragueLocal)),
    state: stateOf(row, now)
  })

const span = (start: DateTime.Utc, end: DateTime.Utc): Calendar.Span => ({ start, end })

const clock = (instant: DateTime.Utc) => Time.toPragueLocal(instant).slice(11)

export class Blocks extends Context.Service<
  Blocks,
  {
    readonly blocks: (window: {
      readonly from: Time.PragueLocal
      readonly to: Time.PragueLocal
    }) => Effect.Effect<ReadonlyArray<Domain.Block>, Errors.Invalid>
    readonly running: Effect.Effect<Option.Option<Domain.Block>>
    /** Plans a block of an open task at a start and a length; a draft has no event until it is confirmed. */
    readonly plan: (input: Domain.PlanWork) => Write<Domain.Block>
    /** Starts a block of an open task now; one block runs at a time. */
    readonly start: (task: Domain.TaskId) => Write<Domain.Block>
    /** Ends the running block now, and its event with it. */
    readonly stop: Write<Domain.Block>
    /** Records work that already happened, ending at `end`. */
    readonly log: (input: Domain.LogWork) => Write<Domain.Block>
    /** Moves or resizes a block that is not running, with its event. */
    readonly move: (input: Domain.MoveWork) => Write<Domain.Block>
    /** Removes a block that is not running, with its event. */
    readonly remove: (id: Domain.BlockId) => Write<void>
    /** Writes a draft block's event into its calendar; a draft the calendar refuses stays a draft. */
    readonly confirm: (id: Domain.BlockId) => Write<Domain.Block>
  }
>()("@ras/work/Blocks") {
  static readonly layer = Layer.effect(
    Blocks,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const writes = yield* Global.Writes
      const events = yield* Calendar.Events
      const db = Effect.provideService(SqlClient.SqlClient, sql)

      const block = (id: string) =>
        Effect.flatMap(db(Store.blockById(id)), (found) =>
          Option.match(found, {
            onNone: () => Effect.fail(new Errors.NotFound({ subject: "work block", id })),
            onSome: Effect.succeed
          })
        )

      /** An open task of the owner's, in a space whose calendar takes its blocks. */
      const workable = (id: Domain.TaskId, verb: string) =>
        Effect.gen(function* () {
          const found = yield* db(Store.taskById(id))
          if (Option.isNone(found)) return yield* new Errors.NotFound({ subject: "task", id })
          const task = found.value.summary
          if (task.status === "done")
            return yield* refuse(
              "done",
              `"${task.title}" is done, so ras is not ${verb} work on it.`,
              "Reopen it first."
            )
          if (task.assignee !== "owner")
            return yield* refuse(
              "agent",
              `"${task.title}" is assigned to ${task.assignee}, and an agent's work takes none of the owner's time.`,
              "Assign it to the owner first."
            )
          const space = Option.getOrThrow(yield* db(Store.spaceById(task.space)))
          if (space.calendar === null)
            return yield* refuse(
              "calendar",
              `The space ${space.name} has no calendar for its work blocks yet.`,
              "Choose its personal calendar under Settings, Spaces."
            )
          return { task, calendar: space.calendar }
        })

      /** Refuses a span another block already takes; a running block takes its time until now. */
      const free = (start: DateTime.Utc, end: DateTime.Utc, now: DateTime.Utc, except: Option.Option<Domain.BlockId>) =>
        Effect.gen(function* () {
          const overlapping = (yield* db(
            Store.blocks({ start: DateTime.formatIso(start), end: DateTime.formatIso(end) }, DateTime.formatIso(now))
          )).filter((other) => !Option.contains(except, other.id))
          const other = overlapping[0]
          if (other === undefined) return
          return yield* refuse(
            "overlap",
            `${other.title} already takes ${clock(other.start)} to ${Option.match(other.end, { onNone: () => "now", onSome: clock })} that day.`,
            "Choose a time that no other block takes."
          )
        })

      const length = (min: number, start: DateTime.Utc, end: DateTime.Utc, what: string) => {
        const minutes = (millis(end) - millis(start)) / 60_000
        return minutes < min || minutes > 720
          ? Effect.fail(new Errors.Invalid({ reason: `${what} runs from ${min} minutes to 12 hours.` }))
          : Effect.void
      }

      const save = <A>(
        action: Global.Action,
        row: Store.BlockRow,
        result: A,
        before: Option.Option<object>,
        after: Option.Option<object>
      ) =>
        writes.run(
          action,
          Effect.as(db(Store.saveBlock(row)), {
            result,
            subject: `block/${row.id}`,
            before: before as Option.Option<Global.Snapshot>,
            after: after as Option.Option<Global.Snapshot>
          })
        )

      const shown = (row: Store.BlockRow) => ({
        task: row.task,
        start: Time.toPragueLocal(row.start),
        end: Option.getOrNull(Option.map(row.end, Time.toPragueLocal)),
        draft: Option.isNone(row.event)
      })

      /** A new block's row, with the event its calendar took unless it is a draft. */
      const create = (
        action: Global.Action,
        target: { readonly task: Domain.TaskSummary; readonly calendar: Calendar.CalendarId },
        start: DateTime.Utc,
        end: Option.Option<DateTime.Utc>,
        eventEnd: Option.Option<DateTime.Utc>
      ) =>
        Effect.gen(function* () {
          const id = yield* Id.generate(Domain.BlockId)
          const project =
            target.task.project === null ? Option.none() : yield* db(Store.projectById(target.task.project))
          const title = Option.match(project, {
            onNone: () => target.task.title,
            onSome: (found) => `${found.name}: ${target.task.title}`
          })
          const event = yield* Option.match(eventEnd, {
            onNone: () => Effect.succeed(Option.none<string>()),
            onSome: (until) =>
              Effect.map(events.placeBlock(target.calendar, { id, title, span: span(start, until) }), Option.some)
          })
          const row: Store.BlockRow = { id, task: target.task.id, title, calendar: target.calendar, start, end, event }
          return yield* save(action, row, view(row, yield* DateTime.now), Option.none(), Option.some(shown(row)))
        })

      return Blocks.of({
        blocks: (window) =>
          Effect.gen(function* () {
            const now = yield* DateTime.now
            const from = yield* Time.toInstant(window.from)
            const to = yield* Time.toInstant(window.to)
            const found = yield* db(
              Store.blocks({ start: DateTime.formatIso(from), end: DateTime.formatIso(to) }, DateTime.formatIso(now))
            )
            return found.map((row) => view(row, now))
          }),

        running: Effect.gen(function* () {
          const now = yield* DateTime.now
          return Option.map(yield* db(Store.runningBlock), (row) => view(row, now))
        }),

        plan: (input) =>
          Effect.gen(function* () {
            const target = yield* workable(input.task, "planning")
            const now = yield* DateTime.now
            const start = yield* Time.toInstant(input.start)
            const end = DateTime.add(start, { minutes: input.minutes })
            if (millis(start) < millis(now) - grace)
              return yield* refuse(
                "past",
                `${input.start} has passed.`,
                "Log work that already happened with log_work."
              )
            yield* free(start, end, now, Option.none())
            return yield* create(
              input.draft === true ? "work.block.drafted" : "work.block.planned",
              target,
              start,
              Option.some(end),
              input.draft === true ? Option.none() : Option.some(end)
            )
          }),

        start: (task) =>
          Effect.gen(function* () {
            const target = yield* workable(task, "starting")
            const running = yield* db(Store.runningBlock)
            if (Option.isSome(running))
              return yield* refuse(
                "running",
                `${running.value.title} has been running since ${clock(running.value.start)}.`,
                "Stop it with stop_work first."
              )
            const now = yield* DateTime.now
            yield* free(now, DateTime.add(now, { minutes: 1 }), now, Option.none())
            return yield* create(
              "work.block.started",
              target,
              now,
              Option.none(),
              Option.some(DateTime.add(now, { milliseconds: runningEvent }))
            )
          }),

        stop: Effect.gen(function* () {
          const found = yield* db(Store.runningBlock)
          if (Option.isNone(found))
            return yield* refuse("idle", "No work is running.", "Start a task's work with start_work.")
          const running = found.value
          const now = yield* DateTime.now
          const end = DateTime.max(now, DateTime.add(running.start, { minutes: 1 }))
          yield* events.moveBlock(Option.getOrThrow(running.event), {
            id: running.id,
            title: running.title,
            span: span(running.start, end)
          })
          const stopped: Store.BlockRow = { ...running, end: Option.some(end) }
          return yield* save(
            "work.block.stopped",
            stopped,
            view(stopped, now),
            Option.some({ end: null }),
            Option.some({ end: Time.toPragueLocal(end) })
          )
        }),

        log: (input) =>
          Effect.gen(function* () {
            const target = yield* workable(input.task, "logging")
            const now = yield* DateTime.now
            const end = yield* Time.toInstant(input.end)
            const start = DateTime.subtract(end, { minutes: input.minutes })
            if (DateTime.isGreaterThan(end, now))
              return yield* refuse("future", `${input.end} has not come yet.`, "Plan future work with plan_work.")
            yield* free(start, end, now, Option.none())
            return yield* create("work.block.logged", target, start, Option.some(end), Option.some(end))
          }),

        move: (input) =>
          Effect.gen(function* () {
            const row = yield* block(input.block)
            const now = yield* DateTime.now
            const state = stateOf(row, now)
            if (state === "running")
              return yield* refuse("running", `${row.title} is running.`, "Stop it with stop_work before moving it.")
            const start = yield* Time.toInstant(input.start)
            const end = yield* Time.toInstant(input.end)
            const ended = state === "done" || (state === "draft" && DateTime.isLessThanOrEqualTo(end, now))
            if (ended) {
              if (DateTime.isGreaterThan(end, now))
                return yield* refuse("future", "Work that has ended stays in the past.", "Choose an end before now.")
              yield* length(1, start, end, "A logged block")
            } else {
              if (millis(start) < millis(now) - grace)
                return yield* refuse("past", `${input.start} has passed.`, "Choose a start from now on.")
              yield* length(5, start, end, "A planned block")
            }
            yield* free(start, end, now, Option.some(row.id))
            if (Option.isSome(row.event))
              yield* events.moveBlock(row.event.value, { id: row.id, title: row.title, span: span(start, end) })
            const moved: Store.BlockRow = { ...row, start, end: Option.some(end) }
            return yield* save(
              "work.block.moved",
              moved,
              view(moved, now),
              Option.some(shown(row)),
              Option.some(shown(moved))
            )
          }),

        remove: (id) =>
          Effect.gen(function* () {
            const row = yield* block(id)
            if (stateOf(row, yield* DateTime.now) === "running")
              return yield* refuse("running", `${row.title} is running.`, "Stop it with stop_work before removing it.")
            if (Option.isSome(row.event)) yield* events.removeBlock(row.event.value)
            yield* writes.run(
              "work.block.removed",
              Effect.as(db(Store.deleteBlock(row.id)), {
                result: undefined,
                subject: `block/${row.id}`,
                before: Option.some(shown(row)),
                after: Option.none()
              })
            )
          }),

        confirm: (id) =>
          Effect.gen(function* () {
            const row = yield* block(id)
            if (Option.isSome(row.event))
              return yield* refuse("confirmed", `This block of ${row.title} is not a draft.`, "Move it with move_work.")
            const end = Option.getOrThrow(row.end)
            const placed = yield* events.placeBlock(row.calendar, {
              id: row.id,
              title: row.title,
              span: span(row.start, end)
            })
            const confirmed: Store.BlockRow = { ...row, event: Option.some(placed) }
            return yield* save(
              "work.block.confirmed",
              confirmed,
              view(confirmed, yield* DateTime.now),
              Option.some({ draft: true }),
              Option.some({ draft: false })
            )
          })
      })
    })
  )

  /** The block drafts the calendar counts as taken, read from the work module's own table. */
  static readonly busyTime = Layer.effect(
    Calendar.BusyTime,
    Effect.map(Effect.service(SqlClient.SqlClient), (sql) =>
      Calendar.BusyTime.of({
        drafts: (window) =>
          Effect.map(
            Effect.provideService(
              Store.blockDrafts({ start: DateTime.formatIso(window.start), end: DateTime.formatIso(window.end) }),
              SqlClient.SqlClient,
              sql
            ),
            (rows) =>
              rows.map((row) => ({
                id: row.id,
                calendar: row.calendar,
                title: row.title,
                span: span(row.start, Option.getOrThrow(row.end))
              }))
          )
      })
    )
  )
}
