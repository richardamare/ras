import * as Effect from "effect/Effect"
import * as SqlClient from "effect/sql/SqlClient"
import type * as Module from "@ras/kernel/Module"

export const migrations: Module.Migrations = {
  "0001_create_audit": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      CREATE TABLE global_audit_entries (
        id INTEGER PRIMARY KEY,
        action TEXT NOT NULL,
        subject TEXT NOT NULL,
        before TEXT,
        after TEXT,
        channel TEXT NOT NULL,
        agent TEXT,
        at TEXT NOT NULL
      ) STRICT`
    yield* sql`CREATE TRIGGER global_audit_no_update BEFORE UPDATE ON global_audit_entries BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END`
    yield* sql`CREATE TRIGGER global_audit_no_delete BEFORE DELETE ON global_audit_entries BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END`
  })
}
