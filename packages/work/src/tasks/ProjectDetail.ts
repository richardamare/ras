import * as Schema from "effect/Schema"
import * as Project from "./Project.ts"
import * as Task from "./Task.ts"

export class ProjectDetail extends Schema.Class<ProjectDetail>("ProjectDetail")({
  ...Project.Project.fields,
  spent: Task.spent,
  tasks: Schema.Array(Task.TaskSummary)
}) {}
