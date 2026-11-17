import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Struct from "effect/Struct"
import * as SqlClient from "effect/sql/SqlClient"
import * as Global from "@ras/global"
import * as Sql from "@ras/kernel/Sql"
import * as Time from "@ras/kernel/Time"
import * as Project from "./Project.ts"
import * as Space from "./Space.ts"
import * as Task from "./Task.ts"

/** The columns of a task a write sets. `updated_at` is the write's instant, and `closed_at` follows the status. */
export type TaskColumns = {
  readonly title: string
  readonly body: string
  readonly status: Task.Status
  readonly assignee: Task.Person
  readonly priority: Task.Priority
  readonly deadline: Time.PragueDate | null
  readonly estimate: number | null
  readonly project: Project.ProjectId | null
  readonly space: Space.SpaceId
}

/** The task with its body, as the row stores it. */
export interface StoredTask {
  readonly summary: Task.TaskSummary
  readonly body: string
}

const TaskRow = Schema.Struct({
  id: Task.TaskId,
  title: Schema.String,
  body: Schema.String,
  status: Task.Status,
  assignee: Task.Person,
  priority: Task.Priority,
  deadline: Schema.NullOr(Time.PragueDate),
  estimate: Schema.NullOr(Schema.Int),
  project: Schema.NullOr(Project.ProjectId),
  space: Space.SpaceId,
  created: Schema.String,
  updated: Schema.String,
  closed: Schema.NullOr(Schema.String)
})
type TaskRow = typeof TaskRow.Type

const toTaskSummary = (row: TaskRow): Task.TaskSummary =>
  new Task.TaskSummary({
    ...Struct.omit(row, ["body"]),
    created: Time.pragueLocalOf(row.created),
    updated: Time.pragueLocalOf(row.updated),
    closed: row.closed === null ? null : Time.pragueLocalOf(row.closed)
  })

const toStoredTask = (row: TaskRow): StoredTask => ({ summary: toTaskSummary(row), body: row.body })

const CommentRow = Schema.Struct({
  id: Task.CommentId,
  author: Task.Person,
  at: Schema.String,
  text: Schema.String,
  link: Schema.NullOr(Schema.String)
})
type CommentRow = typeof CommentRow.Type

const toComment = (row: CommentRow): Task.Comment => new Task.Comment({ ...row, at: Time.pragueLocalOf(row.at) })

const LinkRow = Schema.Struct({ url: Task.LinkUrl })
type LinkRow = typeof LinkRow.Type

const toLink = (row: LinkRow): string => row.url

const write = <A, E>(statement: Effect.Effect<A, E>) => Global.write(Effect.asVoid(Effect.orDie(statement)))

export class TaskRepository extends Context.Service<
  TaskRepository,
  {
    /** Open work first, by deadline; `updatedSince` is a UTC instant. */
    readonly list: (
      filter: Omit<Task.TaskFilter, "updatedSince"> & { readonly updatedSince?: string }
    ) => Effect.Effect<ReadonlyArray<Task.TaskSummary>>
    readonly byId: (id: string) => Effect.Effect<Option.Option<StoredTask>>
    readonly comments: (task: Task.TaskId) => Effect.Effect<ReadonlyArray<Task.Comment>>
    readonly links: (task: Task.TaskId) => Effect.Effect<ReadonlyArray<string>>
    readonly insert: (id: Task.TaskId, task: TaskColumns, at: string) => Effect.Effect<void, never, Global.Transaction>
    /** A task keeps the time it was first closed while it stays done, and loses it when it reopens. */
    readonly update: (id: Task.TaskId, task: TaskColumns, at: string) => Effect.Effect<void, never, Global.Transaction>
    /** Marks the task changed, as a comment or a link does. */
    readonly touch: (id: Task.TaskId, at: string) => Effect.Effect<void, never, Global.Transaction>
    /** Deletes the task with its comments and links. */
    readonly delete: (id: Task.TaskId) => Effect.Effect<void, never, Global.Transaction>
    readonly addComment: (
      task: Task.TaskId,
      comment: {
        readonly id: Task.CommentId
        readonly author: Task.Person
        readonly at: string
      } & Task.NewComment
    ) => Effect.Effect<void, never, Global.Transaction>
    readonly addLink: (task: Task.TaskId, url: string) => Effect.Effect<void, never, Global.Transaction>
    readonly removeLink: (task: Task.TaskId, url: string) => Effect.Effect<void, never, Global.Transaction>
  }
>()("@ras/work/TaskRepository") {
  static readonly layer = Layer.effect(
    TaskRepository,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const columns = sql`
        SELECT id, title, body, status, assignee, priority, deadline, estimate, project_id AS project, space_id AS space,
               created_at AS created, updated_at AS updated, closed_at AS closed
        FROM work_tasks`

      return TaskRepository.of({
        list: (filter) => {
          const clauses = Arr.getSomes([
            Option.map(Option.fromUndefinedOr(filter.status), (status) => sql`status = ${status}`),
            Option.map(Option.fromUndefinedOr(filter.assignee), (assignee) => sql`assignee = ${assignee}`),
            Option.map(Option.fromUndefinedOr(filter.space), (space) => sql`space_id = ${space}`),
            Option.map(Option.fromUndefinedOr(filter.project), (project) => sql`project_id = ${project}`),
            Option.map(Option.fromUndefinedOr(filter.updatedSince), (since) => sql`updated_at >= ${since}`)
          ])
          return Sql.rows(
            TaskRow,
            sql`
              ${columns}
              ${clauses.length === 0 ? sql`` : sql`WHERE ${sql.and(clauses)}`}
              ORDER BY status = 'done', deadline IS NULL, deadline, updated_at DESC`
          ).pipe(Effect.map(Arr.map(toTaskSummary)))
        },

        byId: (id) =>
          Sql.rows(TaskRow, sql`${columns} WHERE id = ${id}`).pipe(
            Effect.map((found) => Option.map(Sql.first(found), toStoredTask))
          ),

        comments: (task) =>
          Sql.rows(
            CommentRow,
            sql`SELECT id, author, at, text, link FROM work_comments WHERE task_id = ${task} ORDER BY at, id`
          ).pipe(Effect.map(Arr.map(toComment))),

        links: (task) =>
          Sql.rows(LinkRow, sql`SELECT url FROM work_links WHERE task_id = ${task} ORDER BY url`).pipe(
            Effect.map(Arr.map(toLink))
          ),

        insert: (id, task, at) =>
          write(sql`
            INSERT INTO work_tasks (id, title, body, status, assignee, priority, deadline, estimate, project_id, space_id,
                                    created_at, updated_at, closed_at)
            VALUES (${id}, ${task.title}, ${task.body}, ${task.status}, ${task.assignee}, ${task.priority},
                    ${task.deadline}, ${task.estimate}, ${task.project}, ${task.space}, ${at}, ${at},
                    ${task.status === "done" ? at : null})`),

        update: (id, task, at) =>
          write(sql`
            UPDATE work_tasks
            SET title = ${task.title}, body = ${task.body}, status = ${task.status}, assignee = ${task.assignee},
                priority = ${task.priority}, deadline = ${task.deadline}, estimate = ${task.estimate},
                project_id = ${task.project}, space_id = ${task.space}, updated_at = ${at},
                closed_at = CASE WHEN ${task.status} = 'done' THEN COALESCE(closed_at, ${at}) END
            WHERE id = ${id}`),

        touch: (id, at) => write(sql`UPDATE work_tasks SET updated_at = ${at} WHERE id = ${id}`),

        delete: (id) =>
          write(
            Effect.gen(function* () {
              yield* sql`DELETE FROM work_comments WHERE task_id = ${id}`
              yield* sql`DELETE FROM work_links WHERE task_id = ${id}`
              yield* sql`DELETE FROM work_tasks WHERE id = ${id}`
            })
          ),

        addComment: (task, comment) =>
          write(sql`
            INSERT INTO work_comments (id, task_id, author, at, text, link)
            VALUES (${comment.id}, ${task}, ${comment.author}, ${comment.at}, ${comment.text}, ${comment.link ?? null})`),

        addLink: (task, url) =>
          write(sql`INSERT INTO work_links (task_id, url) VALUES (${task}, ${url}) ON CONFLICT DO NOTHING`),

        removeLink: (task, url) => write(sql`DELETE FROM work_links WHERE task_id = ${task} AND url = ${url}`)
      })
    })
  )
}
