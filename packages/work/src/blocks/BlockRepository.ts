import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as Calendar from "@ras/calendar"
import * as Global from "@ras/global"
import * as Sql from "@ras/kernel/Sql"
import * as Time from "@ras/kernel/Time"
import * as Block from "./Block.ts"
import * as Project from "../tasks/Project.ts"
import * as Task from "../tasks/Task.ts"

/** A block as its row keeps it: no end while it runs, no event while it is a draft. */
export interface StoredBlock {
  readonly id: Block.BlockId
  readonly task: Task.TaskId
  readonly title: string
  readonly calendar: Calendar.CalendarId
  readonly start: DateTime.Utc
  readonly end: Option.Option<DateTime.Utc>
  readonly event: Option.Option<string>
}

const BlockRow = Schema.Struct({
  id: Block.BlockId,
  task: Task.TaskId,
  taskTitle: Schema.String,
  project: Schema.NullOr(Schema.String),
  calendar: Calendar.CalendarId,
  start: Time.Instant,
  end: Schema.NullOr(Time.Instant),
  event: Schema.NullOr(Schema.String)
})
type BlockRow = typeof BlockRow.Type

/** A block in a project is titled with the project's name before its task's. */
const toStoredBlock = (row: BlockRow): StoredBlock => ({
  id: row.id,
  task: row.task,
  title: row.project === null ? row.taskTitle : `${row.project}: ${row.taskTitle}`,
  calendar: row.calendar,
  start: row.start,
  end: Option.fromNullOr(row.end),
  event: Option.fromNullOr(row.event)
})

const iso = (instant: Option.Option<DateTime.Utc>) => Option.getOrNull(Option.map(instant, DateTime.formatIso))

const write = <A, E>(statement: Effect.Effect<A, E>) => Global.write(Effect.asVoid(Effect.orDie(statement)))

type Span = { readonly start: string; readonly end: string }

export class BlockRepository extends Context.Service<
  BlockRepository,
  {
    readonly byId: (id: string) => Effect.Effect<Option.Option<StoredBlock>>
    /** The block that has no end yet. */
    readonly running: Effect.Effect<Option.Option<StoredBlock>>
    /** The blocks that overlap the span; a running block takes its time until `now`. */
    readonly overlapping: (span: Span, now: string) => Effect.Effect<ReadonlyArray<StoredBlock>>
    readonly draftsInSpan: (span: Span) => Effect.Effect<ReadonlyArray<StoredBlock>>
    readonly ofTask: (task: Task.TaskId) => Effect.Effect<ReadonlyArray<StoredBlock>>
    readonly ofProject: (project: Project.ProjectId) => Effect.Effect<ReadonlyArray<StoredBlock>>
    readonly allDrafts: Effect.Effect<ReadonlyArray<StoredBlock>>
    readonly save: (block: StoredBlock) => Effect.Effect<void, never, Global.Transaction>
    readonly delete: (id: Block.BlockId) => Effect.Effect<void, never, Global.Transaction>
    readonly deleteDrafts: Effect.Effect<void, never, Global.Transaction>
  }
>()("@ras/work/BlockRepository") {
  static readonly layer = Layer.effect(
    BlockRepository,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const blocksWhere = (where: ReturnType<SqlClient.SqlClient["unsafe"]>) =>
        Sql.rows(
          BlockRow,
          sql`
            SELECT b.id, b.task_id AS task, t.title AS "taskTitle", p.name AS project, b.calendar_id AS calendar,
                   b.start_at AS start, b.end_at AS "end", b.event_id AS event
            FROM work_blocks b
            JOIN work_tasks t ON t.id = b.task_id
            LEFT JOIN work_projects p ON p.id = t.project_id
            WHERE ${where}
            ORDER BY b.start_at`
        ).pipe(Effect.map(Arr.map(toStoredBlock)))

      return BlockRepository.of({
        byId: (id) => Effect.map(blocksWhere(sql`b.id = ${id}`), Arr.head),

        running: Effect.map(blocksWhere(sql`b.end_at IS NULL`), Arr.head),

        overlapping: (span, now) =>
          blocksWhere(sql`b.start_at < ${span.end} AND COALESCE(b.end_at, ${now}) > ${span.start}`),

        draftsInSpan: (span) =>
          blocksWhere(sql`b.event_id IS NULL AND b.start_at < ${span.end} AND b.end_at > ${span.start}`),

        ofTask: (task) => blocksWhere(sql`b.task_id = ${task}`),

        ofProject: (project) => blocksWhere(sql`t.project_id = ${project}`),

        allDrafts: blocksWhere(sql`b.event_id IS NULL`),

        save: (block) =>
          write(sql`
            INSERT INTO work_blocks (id, task_id, calendar_id, start_at, end_at, event_id)
            VALUES (${block.id}, ${block.task}, ${block.calendar}, ${DateTime.formatIso(block.start)}, ${iso(block.end)},
                    ${Option.getOrNull(block.event)})
            ON CONFLICT (id) DO UPDATE SET
              start_at = excluded.start_at, end_at = excluded.end_at, event_id = excluded.event_id`),

        delete: (id) => write(sql`DELETE FROM work_blocks WHERE id = ${id}`),

        deleteDrafts: write(sql`DELETE FROM work_blocks WHERE event_id IS NULL`)
      })
    })
  )
}
