import * as Schema from "effect/Schema"
import * as Global from "@ras/global"
import * as Id from "@ras/kernel/Id"
import * as Time from "@ras/kernel/Time"
import * as Project from "./Project.ts"
import * as Space from "./Space.ts"

export const TaskId = Id.Uuid.pipe(Schema.brand("TaskId"))
export type TaskId = typeof TaskId.Type

export const CommentId = Id.Uuid.pipe(Schema.brand("CommentId"))
export type CommentId = typeof CommentId.Type

/** `inbox` holds work an agent proposed on its own; what the owner asks for starts in `todo`. */
export const Status = Schema.Literals(["inbox", "todo", "in_progress", "blocked", "review", "done"])
export type Status = typeof Status.Type

/** The statuses a move into takes a comment in the same call: what is needed, or what to check. */
export const explained: ReadonlyArray<Status> = ["blocked", "review"]

export const Priority = Schema.Literals(["low", "normal", "high", "urgent"])
export type Priority = typeof Priority.Type

/** Who does the work, or who wrote a comment: the owner or an agent. */
export const Person = Schema.Union([Schema.Literal("owner"), Global.AgentSlug])
export type Person = typeof Person.Type

/** A GitHub issue or pull request. */
export const LinkUrl = Schema.String.check(
  Schema.isPattern(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(issues|pull)\/\d+$/)
)

/** A task as a list shows it: everything but its body, comments and links. */
export class TaskSummary extends Schema.Class<TaskSummary>("TaskSummary")({
  id: TaskId,
  title: Schema.String,
  status: Status,
  assignee: Person,
  priority: Priority,
  deadline: Schema.NullOr(Time.PragueDate),
  estimate: Schema.NullOr(Schema.Int).annotate({ description: "Minutes." }),
  project: Schema.NullOr(Project.ProjectId),
  space: Space.SpaceId,
  created: Time.PragueLocal,
  updated: Time.PragueLocal,
  closed: Schema.NullOr(Time.PragueLocal)
}) {}

export class Comment extends Schema.Class<Comment>("Comment")({
  id: CommentId,
  author: Person,
  at: Time.PragueLocal,
  text: Schema.String,
  link: Schema.NullOr(Schema.String)
}) {}

export const spent = Schema.Int.annotate({ description: "Minutes of its work blocks that are done." })

export class Task extends Schema.Class<Task>("Task")({
  ...TaskSummary.fields,
  spent,
  body: Schema.String,
  comments: Schema.Array(Comment),
  links: Schema.Array(LinkUrl)
}) {}

export const NewTask = Schema.Struct({
  title: Schema.String.check(Schema.isNonEmpty()),
  body: Schema.optionalKey(Schema.String).annotate({ description: "Markdown: the brief." }),
  project: Schema.optionalKey(Project.ProjectId),
  space: Schema.optionalKey(Space.SpaceId).annotate({
    description: "Ignored with a project, which decides the space."
  }),
  status: Schema.optionalKey(Status).annotate({
    description: "`todo` when the owner asks, `inbox` when an agent proposes the work on its own."
  }),
  assignee: Schema.optionalKey(Person),
  priority: Schema.optionalKey(Priority),
  deadline: Schema.optionalKey(Time.PragueDate),
  estimate: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))).annotate({ description: "Minutes." })
})
export type NewTask = typeof NewTask.Type

export const TaskChange = Schema.Struct({
  title: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty())),
  body: Schema.optionalKey(Schema.String).annotate({ description: "Only the owner changes the brief." }),
  project: Schema.optionalKey(Schema.NullOr(Project.ProjectId)),
  space: Schema.optionalKey(Space.SpaceId),
  status: Schema.optionalKey(Status),
  assignee: Schema.optionalKey(Person),
  priority: Schema.optionalKey(Priority),
  deadline: Schema.optionalKey(Schema.NullOr(Time.PragueDate)),
  estimate: Schema.optionalKey(Schema.NullOr(Schema.Int.check(Schema.isGreaterThan(0)))),
  comment: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty())).annotate({
    description: "Appended to the task's log in the same write. A move to `blocked` or `review` needs one."
  })
})
export type TaskChange = typeof TaskChange.Type

export const TaskFilter = Schema.Struct({
  status: Schema.optionalKey(Status),
  assignee: Schema.optionalKey(Person),
  space: Schema.optionalKey(Space.SpaceId),
  project: Schema.optionalKey(Project.ProjectId),
  updatedSince: Schema.optionalKey(Time.PragueLocal).annotate({
    description: "Prague local time, `2026-10-22T09:00`: only tasks changed since then."
  })
})
export type TaskFilter = typeof TaskFilter.Type

export const NewComment = Schema.Struct({
  text: Schema.String.check(Schema.isNonEmpty()),
  link: Schema.optionalKey(Schema.String).annotate({ description: "A URL to the output, if there is one." })
})
export type NewComment = typeof NewComment.Type
