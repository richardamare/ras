import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as Sql from "@ras/kernel/Sql"
import * as Actor from "../audit/Actor.ts"
import * as Agent from "./Agent.ts"
import * as Writes from "../audit/Writes.ts"

const AgentRow = Schema.Struct({ slug: Actor.AgentSlug, name: Schema.String, archived: Schema.BooleanFromBit })
type AgentRow = typeof AgentRow.Type

const toAgent = (row: AgentRow): Agent.Agent =>
  new Agent.Agent({ slug: row.slug, name: row.name, archived: row.archived })

const write = <A, E>(statement: Effect.Effect<A, E>) => Writes.write(Effect.asVoid(Effect.orDie(statement)))

export class AgentRepository extends Context.Service<
  AgentRepository,
  {
    readonly all: Effect.Effect<ReadonlyArray<Agent.Agent>>
    readonly bySlug: (slug: string) => Effect.Effect<Option.Option<Agent.Agent>>
    readonly insert: (added: {
      readonly slug: Actor.AgentSlug
      readonly name: string
    }) => Effect.Effect<void, never, Writes.Transaction>
    readonly archive: (slug: Actor.AgentSlug, at: string) => Effect.Effect<void, never, Writes.Transaction>
  }
>()("@ras/global/AgentRepository") {
  static readonly layer = Layer.effect(
    AgentRepository,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const agentsWhere = (slug: Option.Option<string>) =>
        Sql.rows(
          AgentRow,
          sql`
            SELECT slug, name, archived_at IS NOT NULL AS archived FROM global_agents
            ${Option.match(slug, { onNone: () => sql``, onSome: (one) => sql`WHERE slug = ${one}` })}
            ORDER BY slug`
        ).pipe(Effect.map(Arr.map(toAgent)))

      return AgentRepository.of({
        all: agentsWhere(Option.none()),
        bySlug: (slug) => Effect.map(agentsWhere(Option.some(slug)), Sql.first),
        insert: (added) => write(sql`INSERT INTO global_agents (slug, name) VALUES (${added.slug}, ${added.name})`),
        archive: (slug, at) =>
          write(sql`UPDATE global_agents SET archived_at = ${at} WHERE slug = ${slug} AND archived_at IS NULL`)
      })
    })
  )
}
