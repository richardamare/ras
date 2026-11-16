import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as Fact from "./Fact.ts"

export const Hit = Schema.Struct({
  name: Fact.Name,
  description: Schema.String,
  type: Fact.Type,
  excerpt: Schema.String
})
export type Hit = typeof Hit.Type

/** Replaces the search index with `facts`; the clone is its source, so the index is rebuilt rather than patched. */
export const replace = (facts: ReadonlyArray<Fact.Fact>) =>
  SqlClient.SqlClient.use((sql) =>
    sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`DELETE FROM memory_facts`
        yield* Effect.forEach(
          facts,
          (fact) =>
            sql`INSERT INTO memory_facts (name, description, type, text) VALUES (${fact.name}, ${fact.description}, ${fact.type}, ${fact.text})`,
          { discard: true }
        )
      })
    )
  ).pipe(Effect.orDie)

/** Every word of `query` must appear, each as a prefix; FTS5's own operators are taken as plain words. */
const match = (query: string) =>
  Arr.map(
    Arr.filter(query.split(/\s+/), (word) => word.length > 0),
    (word) => `"${word.replaceAll('"', '""')}"*`
  ).join(" ")

export const search = (query: string, limit: number) =>
  Effect.gen(function* () {
    const terms = match(query)
    if (terms === "") return []
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql`
      SELECT name, description, type, snippet(memory_facts, 3, '**', '**', '…', 16) AS excerpt
      FROM memory_facts WHERE memory_facts MATCH ${terms} ORDER BY rank LIMIT ${limit}`
    return yield* Schema.decodeUnknownEffect(Schema.Array(Hit))(rows)
  }).pipe(Effect.orDie)
