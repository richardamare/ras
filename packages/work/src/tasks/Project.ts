import * as Schema from "effect/Schema"
import * as Id from "@ras/kernel/Id"
import * as Time from "@ras/kernel/Time"
import * as Space from "./Space.ts"

export const ProjectId = Id.Uuid.pipe(Schema.brand("ProjectId"))
export type ProjectId = typeof ProjectId.Type

export const ProjectStatus = Schema.Literals(["active", "paused", "done"])
export type ProjectStatus = typeof ProjectStatus.Type

export class Project extends Schema.Class<Project>("Project")({
  id: ProjectId,
  space: Space.SpaceId,
  name: Schema.String,
  status: ProjectStatus,
  deadline: Schema.NullOr(Time.PragueDate),
  description: Schema.NullOr(Schema.String)
}) {}

export const NewProject = Schema.Struct({
  name: Schema.String.check(Schema.isNonEmpty()),
  space: Schema.optionalKey(Space.SpaceId).annotate({ description: "The default space when omitted." }),
  status: Schema.optionalKey(ProjectStatus),
  deadline: Schema.optionalKey(Time.PragueDate),
  description: Schema.optionalKey(Schema.String)
})
export type NewProject = typeof NewProject.Type

export const ProjectChange = Schema.Struct({
  name: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty())),
  space: Schema.optionalKey(Space.SpaceId).annotate({ description: "Moves the project with its tasks." }),
  status: Schema.optionalKey(ProjectStatus),
  deadline: Schema.optionalKey(Schema.NullOr(Time.PragueDate)),
  description: Schema.optionalKey(Schema.NullOr(Schema.String))
})
export type ProjectChange = typeof ProjectChange.Type
