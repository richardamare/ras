import * as SqlClient from "effect/sql/SqlClient"
import type * as Module from "@ras/kernel/Module"

export const migrations: Module.Migrations = {
  "0001_create_search_index": SqlClient.SqlClient.use(
    (sql) =>
      sql`CREATE VIRTUAL TABLE memory_facts USING fts5(name, description, type UNINDEXED, text, tokenize = 'unicode61 remove_diacritics 2')`
  )
}
