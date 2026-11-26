import { assert, describe, it } from "@effect/vitest"
import * as Arr from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Calendar from "@ras/calendar"
import * as Global from "@ras/global"
import * as Testing from "@ras/global/testing"
import * as KernelModule from "@ras/kernel/Module"
import * as BlockRepository from "../../src/blocks/BlockRepository.ts"
import * as Block from "../../src/blocks/Block.ts"
import * as Task from "../../src/tasks/Task.ts"
import * as Migrations from "../../src/Migrations.ts"
import * as SpaceRepository from "../../src/tasks/SpaceRepository.ts"
import * as TaskRepository from "../../src/tasks/TaskRepository.ts"

const tables = KernelModule.make({ name: "work", migrations: Migrations.migrations })

const repositories = Layer.mergeAll(
  BlockRepository.BlockRepository.layer,
  SpaceRepository.SpaceRepository.layer,
  TaskRepository.TaskRepository.layer
).pipe(Layer.provideMerge(Testing.layer([tables])))

const task = Task.TaskId.make("00000000-0000-4000-8000-0000000000a1")
const at = (iso: string) => DateTime.makeUnsafe(iso)
const entry = { subject: "probe", before: Option.none(), after: Option.none() }

const block = (n: number, start: string, end: Option.Option<string>, event: Option.Option<string>) => ({
  id: Block.BlockId.make(`00000000-0000-4000-8000-00000000000${n}`),
  task,
  title: "Plan the week",
  calendar: Calendar.CalendarId.make(1),
  start: at(start),
  end: Option.map(end, at),
  event
})

const save = (...blocks: ReadonlyArray<BlockRepository.StoredBlock>) =>
  Effect.gen(function* () {
    const stored = yield* BlockRepository.BlockRepository
    const writes = yield* Global.Writes
    yield* writes.run(
      "work.block.planned",
      Effect.as(Effect.forEach(blocks, stored.save, { discard: true }), { result: undefined, ...entry })
    )
  })

/** A fresh database with one task in the default space. */
const withTask = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const space = yield* (yield* SpaceRepository.SpaceRepository).defaultSpace
    const tasks = yield* TaskRepository.TaskRepository
    const writes = yield* Global.Writes
    yield* writes.run(
      "work.task.added",
      Effect.as(
        tasks.insert(
          task,
          {
            title: "Plan the week",
            body: "",
            status: "todo",
            assignee: "owner",
            priority: "normal",
            deadline: null,
            estimate: null,
            project: null,
            space: space.id
          },
          "2026-11-17T08:00:00Z"
        ),
        { result: undefined, ...entry }
      )
    )
    return yield* effect
  }).pipe(Effect.provide(repositories))

const span = (start: string, end: string) => ({ start, end })

const ids = (blocks: ReadonlyArray<BlockRepository.StoredBlock>) => Arr.map(blocks, (each) => each.id)

describe("BlockRepository", () => {
  it.effect("counts a running block as taking its time up to now", () =>
    withTask(
      Effect.gen(function* () {
        const running = block(1, "2026-11-18T08:00:00Z", Option.none(), Option.some("event-1"))
        yield* save(running)
        const stored = yield* BlockRepository.BlockRepository
        assert.deepStrictEqual(
          ids(yield* stored.overlapping(span("2026-11-18T09:00:00Z", "2026-11-18T10:00:00Z"), "2026-11-18T09:30:00Z")),
          [running.id]
        )
        assert.deepStrictEqual(
          ids(yield* stored.overlapping(span("2026-11-18T10:00:00Z", "2026-11-18T11:00:00Z"), "2026-11-18T09:30:00Z")),
          []
        )
      })
    )
  )

  it.effect("returns the block that has no end as the running one", () =>
    withTask(
      Effect.gen(function* () {
        const done = block(1, "2026-11-18T07:00:00Z", Option.some("2026-11-18T08:00:00Z"), Option.some("event-1"))
        const running = block(2, "2026-11-18T08:00:00Z", Option.none(), Option.some("event-2"))
        yield* save(done, running)
        assert.deepStrictEqual(
          Option.map(yield* (yield* BlockRepository.BlockRepository).running, (found) => found.id),
          Option.some(running.id)
        )
      })
    )
  )

  it.effect("refuses a second running block with a defect from the unique index", () =>
    withTask(
      Effect.gen(function* () {
        yield* save(block(1, "2026-11-18T08:00:00Z", Option.none(), Option.some("event-1")))
        const exit = yield* Effect.exit(save(block(2, "2026-11-18T09:00:00Z", Option.none(), Option.some("event-2"))))
        assert.isTrue(Exit.hasDies(exit))
      })
    )
  )

  it.effect("leaves confirmed blocks out of the drafts in a span", () =>
    withTask(
      Effect.gen(function* () {
        const draft = block(1, "2026-11-18T08:00:00Z", Option.some("2026-11-18T09:00:00Z"), Option.none())
        const confirmed = block(2, "2026-11-18T09:00:00Z", Option.some("2026-11-18T10:00:00Z"), Option.some("event-2"))
        yield* save(draft, confirmed)
        assert.deepStrictEqual(
          ids(
            yield* (yield* BlockRepository.BlockRepository).draftsInSpan({
              start: "2026-11-18T07:00:00Z",
              end: "2026-11-18T11:00:00Z"
            })
          ),
          [draft.id]
        )
      })
    )
  )
})
