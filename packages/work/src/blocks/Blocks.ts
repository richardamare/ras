import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Semaphore from "effect/Semaphore"
import * as Calendar from "@ras/calendar"
import * as Global from "@ras/global"
import * as Errors from "@ras/kernel/Errors"
import * as Id from "@ras/kernel/Id"
import * as Time from "@ras/kernel/Time"
import * as Block from "./Block.ts"
import * as Task from "../board/Task.ts"
import * as BlockRepository from "./BlockRepository.ts"
import * as ProjectRepository from "../board/ProjectRepository.ts"
import * as SpaceRepository from "../board/SpaceRepository.ts"
import * as TaskRepository from "../board/TaskRepository.ts"

/** A started block's event first runs this long; stopping it sets the real end. */
const runningEvent = 15 * 60_000

const refuse = (code: string, reason: string, instead: string) =>
  Effect.fail(new Errors.Refused({ code: `work.block.${code}`, reason, instead }))

const millis = DateTime.toEpochMillis

export const stateOf = (row: BlockRepository.StoredBlock, now: DateTime.Utc): Block.BlockState =>
  Option.isNone(row.event)
    ? "draft"
    : Option.match(row.end, {
        onNone: () => "running",
        onSome: (end) => (DateTime.isLessThanOrEqualTo(end, now) ? "done" : "planned")
      })

/** A block whose event has begun; a draft never has. */
export const started = (row: BlockRepository.StoredBlock, now: DateTime.Utc) =>
  Option.isSome(row.event) && DateTime.isLessThanOrEqualTo(row.start, now)

/** Minutes of the blocks that are done. */
export const spent = (rows: ReadonlyArray<BlockRepository.StoredBlock>, now: DateTime.Utc) =>
  Math.round(
    rows
      .filter((row) => stateOf(row, now) === "done")
      .reduce((sum, row) => sum + millis(Option.getOrThrow(row.end)) - millis(row.start), 0) / 60_000
  )

export const view = (row: BlockRepository.StoredBlock, now: DateTime.Utc) =>
  new Block.Block({
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

const length = (start: DateTime.Utc, end: DateTime.Utc) => {
  const minutes = (millis(end) - millis(start)) / 60_000
  return minutes < 1 || minutes > 720
    ? Effect.fail(new Errors.Invalid({ reason: "A block runs from 1 minute to 12 hours." }))
    : Effect.void
}

const shown = (row: BlockRepository.StoredBlock) => ({
  task: row.task,
  start: Time.toPragueLocal(row.start),
  end: Option.getOrNull(Option.map(row.end, Time.toPragueLocal)),
  draft: Option.isNone(row.event)
})

export class Blocks extends Context.Service<
  Blocks,
  {
    readonly blocks: (window: {
      readonly from: Time.PragueLocal
      readonly to: Time.PragueLocal
    }) => Effect.Effect<ReadonlyArray<Block.Block>, Errors.Invalid>
    /** A task's blocks, earliest first. */
    readonly ofTask: (task: Task.TaskId) => Effect.Effect<ReadonlyArray<Block.Block>, Errors.NotFound>
    readonly running: Effect.Effect<Option.Option<Block.Block>>
    /**
     * Adds a block of an open task from its start to its end, past, future or across now; a draft has no event until it
     * is confirmed.
     */
    readonly add: (input: Block.AddWork) => Global.Write<Block.Block>
    /** Starts a block of an open task now; one block runs at a time. */
    readonly start: (task: Task.TaskId) => Global.Write<Block.Block>
    /** Ends the running block now, and its event with it. */
    readonly stop: Global.Write<Block.Block>
    /** Moves or resizes a block that is not running, with its event. */
    readonly move: (input: Block.MoveWork) => Global.Write<Block.Block>
    /** Removes a block that is not running, with its event. */
    readonly remove: (id: Block.BlockId) => Global.Write<void>
    /** Writes a draft block's event into its calendar; a draft the calendar refuses stays a draft. */
    readonly confirm: (id: Block.BlockId) => Global.Write<Block.Block>
    /** Removes a task's blocks that have not started, drafts included, with their events. */
    readonly release: (task: Task.TaskId) => Global.Write<void>
  }
>()("@ras/work/Blocks") {
  static readonly layer = Layer.effect(
    Blocks,
    Effect.gen(function* () {
      const spaces = yield* SpaceRepository.SpaceRepository
      const projects = yield* ProjectRepository.ProjectRepository
      const tasks = yield* TaskRepository.TaskRepository
      const storedBlocks = yield* BlockRepository.BlockRepository
      const writes = yield* Global.Writes
      const events = yield* Calendar.Events
      const one = yield* Semaphore.make(1)

      const block = (id: string) => Effect.flatMap(storedBlocks.byId(id), Errors.orNotFound("work block", id))

      /** An open task of the owner's, in a space whose calendar takes its blocks. */
      const workable = (id: Task.TaskId, verb: string) =>
        Effect.gen(function* () {
          const found = yield* tasks.byId(id)
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
          const space = Option.getOrThrow(yield* spaces.byId(task.space))
          if (space.calendar === null)
            return yield* refuse(
              "calendar",
              `The space ${space.name} has no calendar for its work blocks yet.`,
              "Choose its personal calendar under Settings, Spaces."
            )
          return { task, calendar: space.calendar }
        })

      const save = <A>(
        action: Global.Action,
        row: BlockRepository.StoredBlock,
        result: A,
        before: Option.Option<object>,
        after: Option.Option<object>
      ) =>
        writes.run(
          action,
          Effect.as(storedBlocks.save(row), {
            result,
            subject: `block/${row.id}`,
            before: before as Option.Option<Global.Snapshot>,
            after: after as Option.Option<Global.Snapshot>
          })
        )

      const discard = (row: BlockRepository.StoredBlock) =>
        Effect.gen(function* () {
          if (Option.isSome(row.event)) yield* events.removeBlock(row.calendar, row.event.value)
          yield* writes.run(
            "work.block.removed",
            Effect.as(storedBlocks.delete(row.id), {
              result: undefined,
              subject: `block/${row.id}`,
              before: Option.some(shown(row)),
              after: Option.none()
            })
          )
        })

      /** A new block's row, with the event its calendar took unless it is a draft. */
      const create = (
        action: Global.Action,
        target: { readonly task: Task.TaskSummary; readonly calendar: Calendar.CalendarId },
        start: DateTime.Utc,
        end: Option.Option<DateTime.Utc>,
        eventEnd: Option.Option<DateTime.Utc>
      ) =>
        Effect.gen(function* () {
          const id = yield* Id.generate(Block.BlockId)
          const project = target.task.project === null ? Option.none() : yield* projects.byId(target.task.project)
          const title = Option.match(project, {
            onNone: () => target.task.title,
            onSome: (found) => `${found.name}: ${target.task.title}`
          })
          const event = yield* Option.match(eventEnd, {
            onNone: () => Effect.succeed(Option.none<string>()),
            onSome: (until) =>
              Effect.map(events.placeBlock(target.calendar, { id, title, span: span(start, until) }), Option.some)
          })
          const row: BlockRepository.StoredBlock = {
            id,
            task: target.task.id,
            title,
            calendar: target.calendar,
            start,
            end,
            event
          }
          return yield* save(action, row, view(row, yield* DateTime.now), Option.none(), Option.some(shown(row)))
        })

      return Blocks.of({
        blocks: (window) =>
          Effect.gen(function* () {
            const now = yield* DateTime.now
            const from = yield* Time.toInstant(window.from)
            const to = yield* Time.toInstant(window.to)
            const found = yield* storedBlocks.overlapping(
              { start: DateTime.formatIso(from), end: DateTime.formatIso(to) },
              DateTime.formatIso(now)
            )
            return found.map((row) => view(row, now))
          }),

        ofTask: (task) =>
          Effect.gen(function* () {
            yield* Effect.flatMap(tasks.byId(task), Errors.orNotFound("task", task))
            const now = yield* DateTime.now
            return (yield* storedBlocks.ofTask(task)).map((row) => view(row, now))
          }),

        running: Effect.gen(function* () {
          const now = yield* DateTime.now
          return Option.map(yield* storedBlocks.running, (row) => view(row, now))
        }),

        add: (input) =>
          Effect.gen(function* () {
            const target = yield* workable(input.task, "adding")
            const start = yield* Time.toInstant(input.start)
            const end = yield* Time.toInstant(input.end)
            yield* length(start, end)
            const draft = input.draft === true
            return yield* create(
              draft ? "work.block.drafted" : "work.block.added",
              target,
              start,
              Option.some(end),
              draft ? Option.none() : Option.some(end)
            )
          }).pipe(one.withPermit),

        start: (task) =>
          Effect.gen(function* () {
            const target = yield* workable(task, "starting")
            const running = yield* storedBlocks.running
            if (Option.isSome(running))
              return yield* refuse(
                "running",
                `${running.value.title} has been running since ${clock(running.value.start)}.`,
                "Stop it with stop_work first."
              )
            const now = yield* DateTime.now
            return yield* create(
              "work.block.started",
              target,
              now,
              Option.none(),
              Option.some(DateTime.add(now, { milliseconds: runningEvent }))
            )
          }).pipe(one.withPermit),

        stop: Effect.gen(function* () {
          const found = yield* storedBlocks.running
          if (Option.isNone(found))
            return yield* refuse("idle", "No work is running.", "Start a task's work with start_work.")
          const running = found.value
          const now = yield* DateTime.now
          const end = DateTime.max(now, DateTime.add(running.start, { minutes: 1 }))
          yield* events.moveBlock(running.calendar, Option.getOrThrow(running.event), {
            id: running.id,
            title: running.title,
            span: span(running.start, end)
          })
          const stopped: BlockRepository.StoredBlock = { ...running, end: Option.some(end) }
          return yield* save(
            "work.block.stopped",
            stopped,
            view(stopped, now),
            Option.some({ end: null }),
            Option.some({ end: Time.toPragueLocal(end) })
          )
        }).pipe(one.withPermit),

        move: (input) =>
          Effect.gen(function* () {
            const row = yield* block(input.block)
            const now = yield* DateTime.now
            if (stateOf(row, now) === "running")
              return yield* refuse("running", `${row.title} is running.`, "Stop it with stop_work before moving it.")
            const start = yield* Time.toInstant(input.start)
            const end = yield* Time.toInstant(input.end)
            yield* length(start, end)
            if (Option.isSome(row.event))
              yield* events.moveBlock(row.calendar, row.event.value, {
                id: row.id,
                title: row.title,
                span: span(start, end)
              })
            const moved: BlockRepository.StoredBlock = { ...row, start, end: Option.some(end) }
            return yield* save(
              "work.block.moved",
              moved,
              view(moved, now),
              Option.some(shown(row)),
              Option.some(shown(moved))
            )
          }).pipe(one.withPermit),

        remove: (id) =>
          Effect.gen(function* () {
            const row = yield* block(id)
            if (stateOf(row, yield* DateTime.now) === "running")
              return yield* refuse("running", `${row.title} is running.`, "Stop it with stop_work before removing it.")
            yield* discard(row)
          }).pipe(one.withPermit),

        release: (task) =>
          Effect.gen(function* () {
            const now = yield* DateTime.now
            const rows = yield* storedBlocks.ofTask(task)
            yield* Effect.forEach(
              rows.filter((row) => !started(row, now)),
              discard,
              { discard: true }
            )
          }).pipe(one.withPermit),

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
            const confirmed: BlockRepository.StoredBlock = { ...row, event: Option.some(placed) }
            return yield* save(
              "work.block.confirmed",
              confirmed,
              view(confirmed, yield* DateTime.now),
              Option.some({ draft: true }),
              Option.some({ draft: false })
            )
          }).pipe(one.withPermit)
      })
    })
  )

  /** The block drafts the calendar counts as taken, read from the work module's own table. */
  static readonly busyTime = Layer.effect(
    Calendar.BusyTime,
    Effect.map(Effect.service(BlockRepository.BlockRepository), (storedBlocks) =>
      Calendar.BusyTime.of({
        drafts: (window) =>
          Effect.map(
            storedBlocks.draftsInSpan({ start: DateTime.formatIso(window.start), end: DateTime.formatIso(window.end) }),
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
  ).pipe(Layer.provide(BlockRepository.BlockRepository.layer))
}
