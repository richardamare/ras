import * as Schema from "effect/Schema"
import * as Global from "@ras/global"
import * as Id from "@ras/kernel/Id"
import * as Time from "@ras/kernel/Time"

export const SpaceId = Id.Uuid.pipe(Schema.brand("SpaceId"))
export type SpaceId = typeof SpaceId.Type
export const ProjectId = Id.Uuid.pipe(Schema.brand("ProjectId"))
export type ProjectId = typeof ProjectId.Type
export const TaskId = Id.Uuid.pipe(Schema.brand("TaskId"))
export type TaskId = typeof TaskId.Type
export const CommentId = Id.Uuid.pipe(Schema.brand("CommentId"))
export type CommentId = typeof CommentId.Type

export const Color = Schema.String.check(Schema.isPattern(/^#[0-9a-f]{6}$/))

export const ProjectStatus = Schema.Literals(["active", "paused", "done"])
export type ProjectStatus = typeof ProjectStatus.Type

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

export class Space extends Schema.Class<Space>("Space")({
  id: SpaceId,
  name: Schema.String,
  color: Color,
  position: Schema.Int,
  /** The personal calendar its work blocks are written to, chosen once calendars exist. */
  calendar: Schema.NullOr(Schema.String),
  default: Schema.Boolean,
  archived: Schema.Boolean
}) {}

export class Project extends Schema.Class<Project>("Project")({
  id: ProjectId,
  space: SpaceId,
  name: Schema.String,
  status: ProjectStatus,
  deadline: Schema.NullOr(Time.PragueDate),
  description: Schema.NullOr(Schema.String)
}) {}

/** A task as a list shows it: everything but its body, comments and links. */
export class TaskSummary extends Schema.Class<TaskSummary>("TaskSummary")({
  id: TaskId,
  title: Schema.String,
  status: Status,
  assignee: Person,
  priority: Priority,
  deadline: Schema.NullOr(Time.PragueDate),
  estimate: Schema.NullOr(Schema.Int).annotate({ description: "Minutes." }),
  project: Schema.NullOr(ProjectId),
  space: SpaceId,
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

export class Task extends Schema.Class<Task>("Task")({
  ...TaskSummary.fields,
  body: Schema.String,
  comments: Schema.Array(Comment),
  links: Schema.Array(LinkUrl)
}) {}

export class ProjectDetail extends Schema.Class<ProjectDetail>("ProjectDetail")({
  ...Project.fields,
  tasks: Schema.Array(TaskSummary)
}) {}

export const NewSpace = Schema.Struct({
  name: Schema.String.check(Schema.isNonEmpty()),
  color: Color
})

export const SpaceChange = Schema.Struct({
  name: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty())),
  color: Schema.optionalKey(Color),
  position: Schema.optionalKey(Schema.Int),
  default: Schema.optionalKey(Schema.Literal(true)).annotate({ description: "Makes this the default space." })
})

export const NewProject = Schema.Struct({
  name: Schema.String.check(Schema.isNonEmpty()),
  space: Schema.optionalKey(SpaceId).annotate({ description: "The default space when omitted." }),
  status: Schema.optionalKey(ProjectStatus),
  deadline: Schema.optionalKey(Time.PragueDate),
  description: Schema.optionalKey(Schema.String)
})
export type NewProject = typeof NewProject.Type

export const ProjectChange = Schema.Struct({
  name: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty())),
  space: Schema.optionalKey(SpaceId).annotate({ description: "Moves the project with its tasks." }),
  status: Schema.optionalKey(ProjectStatus),
  deadline: Schema.optionalKey(Schema.NullOr(Time.PragueDate)),
  description: Schema.optionalKey(Schema.NullOr(Schema.String))
})
export type ProjectChange = typeof ProjectChange.Type

export const NewTask = Schema.Struct({
  title: Schema.String.check(Schema.isNonEmpty()),
  body: Schema.optionalKey(Schema.String).annotate({ description: "Markdown: the brief." }),
  project: Schema.optionalKey(ProjectId),
  space: Schema.optionalKey(SpaceId).annotate({ description: "Ignored with a project, which decides the space." }),
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
  project: Schema.optionalKey(Schema.NullOr(ProjectId)),
  space: Schema.optionalKey(SpaceId),
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
  space: Schema.optionalKey(SpaceId),
  project: Schema.optionalKey(ProjectId),
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
