import * as Arr from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Struct from "effect/Struct"
import * as SqlClient from "effect/sql/SqlClient"
import * as Calendar from "@ras/calendar"
import * as Global from "@ras/global"
import * as Time from "@ras/kernel/Time"
import * as Domain from "./Domain.ts"

/** Every read decodes its rows; a row that does not decode is a defect of the store, not a failure of the caller. */
const rows = <S extends Schema.Top>(
  schema: S,
  query: Effect.Effect<ReadonlyArray<unknown>, unknown, SqlClient.SqlClient>
) => query.pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(schema))), Effect.orDie)

const first = <A>(found: ReadonlyArray<A>) => Option.fromUndefinedOr(found[0])

const write = <A, E>(statement: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Global.write(Effect.asVoid(Effect.orDie(statement)))

const SpaceRow = Schema.Struct({
  id: Domain.SpaceId,
  name: Schema.String,
  color: Domain.Color,
  position: Schema.Int,
  calendar: Schema.NullOr(Schema.NumberFromString.pipe(Schema.decodeTo(Calendar.CalendarId))),
  default: Schema.BooleanFromBit,
  archived: Schema.BooleanFromBit
})

/** The column keeps the calendar's id as text. */
const calendarText = (space: Domain.Space) => (space.calendar === null ? null : String(space.calendar))

const spaceColumns = (sql: SqlClient.SqlClient) =>
  sql`SELECT id, name, color, position, calendar, is_default AS "default", archived_at IS NOT NULL AS archived FROM work_spaces`

export const spaces = rows(
  SpaceRow,
  SqlClient.SqlClient.use((sql) => sql`${spaceColumns(sql)} ORDER BY position, name`)
).pipe(Effect.map(Arr.map((row) => new Domain.Space(row))))

export const spaceById = (id: string) =>
  rows(
    SpaceRow,
    SqlClient.SqlClient.use((sql) => sql`${spaceColumns(sql)} WHERE id = ${id}`)
  ).pipe(Effect.map((found) => Option.map(first(found), (row) => new Domain.Space(row))))

export const defaultSpace = rows(
  SpaceRow,
  SqlClient.SqlClient.use((sql) => sql`${spaceColumns(sql)} WHERE is_default = 1`)
).pipe(Effect.map((found) => new Domain.Space(found[0]!)))

export const insertSpace = (space: Domain.Space) =>
  write(
    SqlClient.SqlClient.use(
      (sql) => sql`
        INSERT INTO work_spaces (id, name, color, position, calendar, is_default)
        VALUES (${space.id}, ${space.name}, ${space.color}, ${space.position}, ${calendarText(space)}, 0)`
    )
  )

export const updateSpace = (space: Domain.Space) =>
  write(
    SqlClient.SqlClient.use((sql) =>
      Effect.gen(function* () {
        if (space.default) yield* sql`UPDATE work_spaces SET is_default = 0 WHERE is_default = 1 AND id != ${space.id}`
        yield* sql`
          UPDATE work_spaces
          SET name = ${space.name}, color = ${space.color}, position = ${space.position},
              calendar = ${calendarText(space)}, is_default = ${space.default ? 1 : 0}
          WHERE id = ${space.id}`
      })
    )
  )

export const archiveSpace = (id: Domain.SpaceId, at: string) =>
  write(SqlClient.SqlClient.use((sql) => sql`UPDATE work_spaces SET archived_at = ${at} WHERE id = ${id}`))

const ProjectRow = Schema.Struct({
  id: Domain.ProjectId,
  space: Domain.SpaceId,
  name: Schema.String,
  status: Domain.ProjectStatus,
  deadline: Schema.NullOr(Time.PragueDate),
  description: Schema.NullOr(Schema.String)
})

const projectColumns = (sql: SqlClient.SqlClient) =>
  sql`SELECT id, space_id AS space, name, status, deadline, description FROM work_projects`

export const projects = (filter: { readonly space: Option.Option<Domain.SpaceId> }) =>
  rows(
    ProjectRow,
    SqlClient.SqlClient.use(
      (sql) => sql`
        ${projectColumns(sql)}
        ${Option.match(filter.space, { onNone: () => sql``, onSome: (space) => sql`WHERE space_id = ${space}` })}
        ORDER BY status = 'done', deadline IS NULL, deadline, name`
    )
  ).pipe(Effect.map(Arr.map((row) => new Domain.Project(row))))

export const projectById = (id: string) =>
  rows(
    ProjectRow,
    SqlClient.SqlClient.use((sql) => sql`${projectColumns(sql)} WHERE id = ${id}`)
  ).pipe(Effect.map((found) => Option.map(first(found), (row) => new Domain.Project(row))))

export const insertProject = (project: Domain.Project) =>
  write(
    SqlClient.SqlClient.use(
      (sql) => sql`
        INSERT INTO work_projects (id, space_id, name, status, deadline, description)
        VALUES (${project.id}, ${project.space}, ${project.name}, ${project.status}, ${project.deadline},
                ${project.description})`
    )
  )

/** Saves the project; a project that moved space takes its tasks along. */
export const updateProject = (project: Domain.Project) =>
  write(
    SqlClient.SqlClient.use((sql) =>
      Effect.gen(function* () {
        yield* sql`
          UPDATE work_projects
          SET space_id = ${project.space}, name = ${project.name}, status = ${project.status},
              deadline = ${project.deadline}, description = ${project.description}
          WHERE id = ${project.id}`
        yield* sql`UPDATE work_tasks SET space_id = ${project.space} WHERE project_id = ${project.id}`
      })
    )
  )

const TaskRow = Schema.Struct({
  id: Domain.TaskId,
  title: Schema.String,
  body: Schema.String,
  status: Domain.Status,
  assignee: Domain.Person,
  priority: Domain.Priority,
  deadline: Schema.NullOr(Time.PragueDate),
  estimate: Schema.NullOr(Schema.Int),
  project: Schema.NullOr(Domain.ProjectId),
  space: Domain.SpaceId,
  created: Schema.String,
  updated: Schema.String,
  closed: Schema.NullOr(Schema.String)
})
type TaskRow = typeof TaskRow.Type

const taskColumns = (sql: SqlClient.SqlClient) => sql`
  SELECT id, title, body, status, assignee, priority, deadline, estimate, project_id AS project, space_id AS space,
         created_at AS created, updated_at AS updated, closed_at AS closed
  FROM work_tasks`

const summary = (row: TaskRow) =>
  new Domain.TaskSummary({
    ...Struct.omit(row, ["body"]),
    created: Time.pragueLocalOf(row.created),
    updated: Time.pragueLocalOf(row.updated),
    closed: row.closed === null ? null : Time.pragueLocalOf(row.closed)
  })

/** Open work first, by deadline; `updatedSince` is a UTC instant. */
export const tasks = (filter: Omit<Domain.TaskFilter, "updatedSince"> & { readonly updatedSince?: string }) =>
  rows(
    TaskRow,
    SqlClient.SqlClient.use((sql) => {
      const clauses = Arr.getSomes([
        Option.map(Option.fromUndefinedOr(filter.status), (status) => sql`status = ${status}`),
        Option.map(Option.fromUndefinedOr(filter.assignee), (assignee) => sql`assignee = ${assignee}`),
        Option.map(Option.fromUndefinedOr(filter.space), (space) => sql`space_id = ${space}`),
        Option.map(Option.fromUndefinedOr(filter.project), (project) => sql`project_id = ${project}`),
        Option.map(Option.fromUndefinedOr(filter.updatedSince), (since) => sql`updated_at >= ${since}`)
      ])
      return sql`
        ${taskColumns(sql)}
        ${clauses.length === 0 ? sql`` : sql`WHERE ${sql.and(clauses)}`}
        ORDER BY status = 'done', deadline IS NULL, deadline, updated_at DESC`
    })
  ).pipe(Effect.map(Arr.map(summary)))

/** The task with its body, as the row stores it. */
export const taskById = (id: string) =>
  rows(
    TaskRow,
    SqlClient.SqlClient.use((sql) => sql`${taskColumns(sql)} WHERE id = ${id}`)
  ).pipe(Effect.map((found) => Option.map(first(found), (row) => ({ summary: summary(row), body: row.body }))))

const CommentRow = Schema.Struct({
  id: Domain.CommentId,
  author: Domain.Person,
  at: Schema.String,
  text: Schema.String,
  link: Schema.NullOr(Schema.String)
})

export const comments = (task: Domain.TaskId) =>
  rows(
    CommentRow,
    SqlClient.SqlClient.use(
      (sql) => sql`SELECT id, author, at, text, link FROM work_comments WHERE task_id = ${task} ORDER BY at, id`
    )
  ).pipe(Effect.map(Arr.map((row) => new Domain.Comment({ ...row, at: Time.pragueLocalOf(row.at) }))))

export const links = (task: Domain.TaskId) =>
  rows(
    Domain.LinkUrl,
    SqlClient.SqlClient.use((sql) =>
      Effect.map(sql<{ url: string }>`SELECT url FROM work_links WHERE task_id = ${task} ORDER BY url`, (found) =>
        found.map((row) => row.url)
      )
    )
  )

/** The columns of a task a write sets. `updated_at` is the write's instant, and `closed_at` follows the status. */
export type TaskColumns = {
  readonly title: string
  readonly body: string
  readonly status: Domain.Status
  readonly assignee: Domain.Person
  readonly priority: Domain.Priority
  readonly deadline: Time.PragueDate | null
  readonly estimate: number | null
  readonly project: Domain.ProjectId | null
  readonly space: Domain.SpaceId
}

export const insertTask = (id: Domain.TaskId, task: TaskColumns, at: string) =>
  write(
    SqlClient.SqlClient.use(
      (sql) => sql`
        INSERT INTO work_tasks (id, title, body, status, assignee, priority, deadline, estimate, project_id, space_id,
                                created_at, updated_at, closed_at)
        VALUES (${id}, ${task.title}, ${task.body}, ${task.status}, ${task.assignee}, ${task.priority},
                ${task.deadline}, ${task.estimate}, ${task.project}, ${task.space}, ${at}, ${at},
                ${task.status === "done" ? at : null})`
    )
  )

/** A task keeps the time it was first closed while it stays done, and loses it when it reopens. */
export const updateTask = (id: Domain.TaskId, task: TaskColumns, at: string) =>
  write(
    SqlClient.SqlClient.use(
      (sql) => sql`
        UPDATE work_tasks
        SET title = ${task.title}, body = ${task.body}, status = ${task.status}, assignee = ${task.assignee},
            priority = ${task.priority}, deadline = ${task.deadline}, estimate = ${task.estimate},
            project_id = ${task.project}, space_id = ${task.space}, updated_at = ${at},
            closed_at = CASE WHEN ${task.status} = 'done' THEN COALESCE(closed_at, ${at}) END
        WHERE id = ${id}`
    )
  )

/** Marks the task changed, as a comment or a link does. */
export const touchTask = (id: Domain.TaskId, at: string) =>
  write(SqlClient.SqlClient.use((sql) => sql`UPDATE work_tasks SET updated_at = ${at} WHERE id = ${id}`))

export const deleteTask = (id: Domain.TaskId) =>
  write(
    SqlClient.SqlClient.use((sql) =>
      Effect.gen(function* () {
        yield* sql`DELETE FROM work_comments WHERE task_id = ${id}`
        yield* sql`DELETE FROM work_links WHERE task_id = ${id}`
        yield* sql`DELETE FROM work_tasks WHERE id = ${id}`
      })
    )
  )

export const insertComment = (
  task: Domain.TaskId,
  comment: { readonly id: Domain.CommentId; readonly author: Domain.Person; readonly at: string } & Domain.NewComment
) =>
  write(
    SqlClient.SqlClient.use(
      (sql) => sql`
        INSERT INTO work_comments (id, task_id, author, at, text, link)
        VALUES (${comment.id}, ${task}, ${comment.author}, ${comment.at}, ${comment.text}, ${comment.link ?? null})`
    )
  )

export const insertLink = (task: Domain.TaskId, url: string) =>
  write(
    SqlClient.SqlClient.use(
      (sql) => sql`INSERT INTO work_links (task_id, url) VALUES (${task}, ${url}) ON CONFLICT DO NOTHING`
    )
  )

export const deleteLink = (task: Domain.TaskId, url: string) =>
  write(SqlClient.SqlClient.use((sql) => sql`DELETE FROM work_links WHERE task_id = ${task} AND url = ${url}`))

/** A block as its row keeps it: no end while it runs, no event while it is a draft. */
export interface BlockRow {
  readonly id: Domain.BlockId
  readonly task: Domain.TaskId
  readonly title: string
  readonly calendar: Calendar.CalendarId
  readonly start: DateTime.Utc
  readonly end: Option.Option<DateTime.Utc>
  readonly event: Option.Option<string>
}

const BlockColumns = Schema.Struct({
  id: Domain.BlockId,
  task: Domain.TaskId,
  taskTitle: Schema.String,
  project: Schema.NullOr(Schema.String),
  calendar: Calendar.CalendarId,
  start: Time.Instant,
  end: Schema.NullOr(Time.Instant),
  event: Schema.NullOr(Schema.String)
})

const blocksWhere = (where: (sql: SqlClient.SqlClient) => ReturnType<SqlClient.SqlClient["unsafe"]>) =>
  rows(
    BlockColumns,
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT b.id, b.task_id AS task, t.title AS "taskTitle", p.name AS project, b.calendar_id AS calendar,
               b.start_at AS start, b.end_at AS "end", b.event_id AS event
        FROM work_blocks b
        JOIN work_tasks t ON t.id = b.task_id
        LEFT JOIN work_projects p ON p.id = t.project_id
        WHERE ${where(sql)}
        ORDER BY b.start_at`
    )
  ).pipe(
    Effect.map(
      Arr.map((row): BlockRow => ({
        id: row.id,
        task: row.task,
        title: row.project === null ? row.taskTitle : `${row.project}: ${row.taskTitle}`,
        calendar: row.calendar,
        start: row.start,
        end: Option.fromNullOr(row.end),
        event: Option.fromNullOr(row.event)
      }))
    )
  )

export const blockById = (id: string) =>
  Effect.map(
    blocksWhere((sql) => sql`b.id = ${id}`),
    Arr.head
  )

export const runningBlock = Effect.map(
  blocksWhere((sql) => sql`b.end_at IS NULL`),
  Arr.head
)

/** The blocks that overlap the span; a running block takes its time until `now`. */
export const blocks = (span: { readonly start: string; readonly end: string }, now: string) =>
  blocksWhere((sql) => sql`b.start_at < ${span.end} AND COALESCE(b.end_at, ${now}) > ${span.start}`)

export const blockDrafts = (span: { readonly start: string; readonly end: string }) =>
  blocksWhere((sql) => sql`b.event_id IS NULL AND b.start_at < ${span.end} AND b.end_at > ${span.start}`)

export const blocksOfTask = (task: Domain.TaskId) => blocksWhere((sql) => sql`b.task_id = ${task}`)

export const blocksOfProject = (project: Domain.ProjectId) => blocksWhere((sql) => sql`t.project_id = ${project}`)

const iso = (instant: Option.Option<DateTime.Utc>) => Option.getOrNull(Option.map(instant, DateTime.formatIso))

export const saveBlock = (block: BlockRow) =>
  write(
    SqlClient.SqlClient.use(
      (sql) => sql`
        INSERT INTO work_blocks (id, task_id, calendar_id, start_at, end_at, event_id)
        VALUES (${block.id}, ${block.task}, ${block.calendar}, ${DateTime.formatIso(block.start)}, ${iso(block.end)},
                ${Option.getOrNull(block.event)})
        ON CONFLICT (id) DO UPDATE SET
          start_at = excluded.start_at, end_at = excluded.end_at, event_id = excluded.event_id`
    )
  )

export const deleteBlock = (id: Domain.BlockId) =>
  write(SqlClient.SqlClient.use((sql) => sql`DELETE FROM work_blocks WHERE id = ${id}`))

export const allBlockDrafts = blocksWhere((sql) => sql`b.event_id IS NULL`)

export const deleteBlockDrafts = write(
  SqlClient.SqlClient.use((sql) => sql`DELETE FROM work_blocks WHERE event_id IS NULL`)
)
