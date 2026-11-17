import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as Global from "@ras/global"
import * as Sql from "@ras/kernel/Sql"
import * as Time from "@ras/kernel/Time"
import * as Domain from "./Domain.ts"

const ProjectRow = Schema.Struct({
  id: Domain.ProjectId,
  space: Domain.SpaceId,
  name: Schema.String,
  status: Domain.ProjectStatus,
  deadline: Schema.NullOr(Time.PragueDate),
  description: Schema.NullOr(Schema.String)
})
type ProjectRow = typeof ProjectRow.Type

const toProject = (row: ProjectRow): Domain.Project => new Domain.Project(row)

const write = <A, E>(statement: Effect.Effect<A, E>) => Global.write(Effect.asVoid(Effect.orDie(statement)))

export class ProjectRepository extends Context.Service<
  ProjectRepository,
  {
    /** Open projects first, by deadline. */
    readonly list: (filter: {
      readonly space: Option.Option<Domain.SpaceId>
    }) => Effect.Effect<ReadonlyArray<Domain.Project>>
    readonly byId: (id: string) => Effect.Effect<Option.Option<Domain.Project>>
    readonly insert: (project: Domain.Project) => Effect.Effect<void, never, Global.Transaction>
    /** Saves the project; a project that moved space takes its tasks along. */
    readonly update: (project: Domain.Project) => Effect.Effect<void, never, Global.Transaction>
  }
>()("@ras/work/ProjectRepository") {
  static readonly layer = Layer.effect(
    ProjectRepository,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const columns = sql`SELECT id, space_id AS space, name, status, deadline, description FROM work_projects`

      return ProjectRepository.of({
        list: (filter) =>
          Sql.rows(
            ProjectRow,
            sql`
              ${columns}
              ${Option.match(filter.space, { onNone: () => sql``, onSome: (space) => sql`WHERE space_id = ${space}` })}
              ORDER BY status = 'done', deadline IS NULL, deadline, name`
          ).pipe(Effect.map(Arr.map(toProject))),

        byId: (id) =>
          Sql.rows(ProjectRow, sql`${columns} WHERE id = ${id}`).pipe(
            Effect.map((found) => Option.map(Sql.first(found), toProject))
          ),

        insert: (project) =>
          write(sql`
            INSERT INTO work_projects (id, space_id, name, status, deadline, description)
            VALUES (${project.id}, ${project.space}, ${project.name}, ${project.status}, ${project.deadline},
                    ${project.description})`),

        update: (project) =>
          write(
            Effect.gen(function* () {
              yield* sql`
                UPDATE work_projects
                SET space_id = ${project.space}, name = ${project.name}, status = ${project.status},
                    deadline = ${project.deadline}, description = ${project.description}
                WHERE id = ${project.id}`
              yield* sql`UPDATE work_tasks SET space_id = ${project.space} WHERE project_id = ${project.id}`
            })
          )
      })
    })
  )
}
