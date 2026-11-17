import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as Sql from "@ras/kernel/Sql"
import * as Fact from "./Fact.ts"

const HitRow = Schema.Struct({
  name: Fact.Name,
  description: Schema.String,
  type: Fact.Type,
  excerpt: Schema.String
})
type HitRow = typeof HitRow.Type

const toHit = (row: HitRow): Fact.Hit => ({
  name: row.name,
  description: row.description,
  type: row.type,
  excerpt: row.excerpt
})

/** Every word of `query` must appear, each as a prefix; FTS5's own operators are taken as plain words. */
const match = (query: string) =>
  Arr.map(
    Arr.filter(query.split(/\s+/), (word) => word.length > 0),
    (word) => `"${word.replaceAll('"', '""')}"*`
  ).join(" ")

/** The full-text index of the facts in the memory clone. */
export class SearchIndexRepository extends Context.Service<
  SearchIndexRepository,
  {
    /**
     * Replaces the index with `facts`, in its own transaction and unaudited: the clone is its source, so the index is
     * rebuilt rather than patched.
     */
    readonly replace: (facts: ReadonlyArray<Fact.Fact>) => Effect.Effect<void>
    readonly search: (query: string, limit: number) => Effect.Effect<ReadonlyArray<Fact.Hit>>
  }
>()("@ras/memory/SearchIndexRepository") {
  static readonly layer = Layer.effect(
    SearchIndexRepository,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      return SearchIndexRepository.of({
        replace: (facts) =>
          sql
            .withTransaction(
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
            .pipe(Effect.orDie),

        search: (query, limit) => {
          const terms = match(query)
          if (terms === "") return Effect.succeed([])
          return Sql.rows(
            HitRow,
            sql`
              SELECT name, description, type, snippet(memory_facts, 3, '**', '**', '…', 16) AS excerpt
              FROM memory_facts WHERE memory_facts MATCH ${terms} ORDER BY rank LIMIT ${limit}`
          ).pipe(Effect.map(Arr.map(toHit)))
        }
      })
    })
  )
}
