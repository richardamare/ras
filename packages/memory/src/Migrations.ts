import * as Effect from "effect/Effect"
import * as SqlClient from "effect/sql/SqlClient"
import type * as Module from "@ras/kernel/Module"

export const migrations: Module.Migrations = {
  "0001_create_search_index": SqlClient.SqlClient.use(
    (sql) =>
      sql`CREATE VIRTUAL TABLE memory_facts USING fts5(name, description, type UNINDEXED, text, tokenize = 'unicode61 remove_diacritics 2')`
  ),
  "0002_index_facts_by_path": SqlClient.SqlClient.use((sql) =>
    Effect.andThen(
      sql`DROP TABLE memory_facts`,
      sql`CREATE VIRTUAL TABLE memory_facts USING fts5(path, kind UNINDEXED, description, text, tokenize = 'unicode61 remove_diacritics 2')`
    )
  )
}
