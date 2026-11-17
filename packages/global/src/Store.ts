import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as Actor from "./Actor.ts"
import * as Writes from "./Writes.ts"

export class Agent extends Schema.Class<Agent>("Agent")({
  slug: Actor.AgentSlug,
  name: Schema.String,
  archived: Schema.Boolean
}) {}

const Row = Schema.Struct({ slug: Actor.AgentSlug, name: Schema.String, archived: Schema.BooleanFromBit })

const decode = Schema.decodeUnknownEffect(Schema.Array(Row))

const agentsWhere = (slug: Option.Option<string>) =>
  SqlClient.SqlClient.use(
    (sql) => sql`
      SELECT slug, name, archived_at IS NOT NULL AS archived FROM global_agents
      ${Option.match(slug, { onNone: () => sql``, onSome: (one) => sql`WHERE slug = ${one}` })}
      ORDER BY slug`
  ).pipe(
    Effect.flatMap(decode),
    Effect.map((rows) => rows.map((row) => new Agent(row))),
    Effect.orDie
  )

export const agents = agentsWhere(Option.none())

export const agent = (slug: string) =>
  Effect.map(agentsWhere(Option.some(slug)), (rows) => Option.fromUndefinedOr(rows[0]))

export const insert = (added: { readonly slug: Actor.AgentSlug; readonly name: string }) =>
  Writes.write(
    SqlClient.SqlClient.use(
      (sql) => sql`INSERT INTO global_agents (slug, name) VALUES (${added.slug}, ${added.name})`
    ).pipe(Effect.orDie)
  )

export const archive = (slug: Actor.AgentSlug, at: string) =>
  Writes.write(
    SqlClient.SqlClient.use(
      (sql) => sql`UPDATE global_agents SET archived_at = ${at} WHERE slug = ${slug} AND archived_at IS NULL`
    ).pipe(Effect.orDie)
  )
