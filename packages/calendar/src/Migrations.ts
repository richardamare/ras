import * as Effect from "effect/Effect"
import * as SqlClient from "effect/sql/SqlClient"
import type * as Module from "@ras/kernel/Module"

export const migrations: Module.Migrations = {
  "0001_create_cache": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      CREATE TABLE calendar_calendars (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        account INTEGER NOT NULL,
        provider_id TEXT,
        position INTEGER NOT NULL,
        connected INTEGER NOT NULL DEFAULT 1,
        role TEXT NOT NULL DEFAULT 'unmarked',
        enabled INTEGER NOT NULL DEFAULT 1
      ) STRICT`
    yield* sql`
      CREATE TABLE calendar_events (
        calendar_id INTEGER NOT NULL,
        event_id TEXT NOT NULL,
        date TEXT NOT NULL,
        title TEXT NOT NULL,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        all_day INTEGER NOT NULL,
        kind TEXT NOT NULL,
        show_as TEXT NOT NULL,
        rsvp TEXT NOT NULL,
        cancelled INTEGER NOT NULL,
        recurring INTEGER NOT NULL,
        location TEXT,
        category TEXT,
        notes TEXT,
        attendees TEXT NOT NULL,
        copy_of TEXT,
        PRIMARY KEY (calendar_id, event_id, date)
      ) STRICT`
    yield* sql`CREATE INDEX calendar_events_span ON calendar_events (start_at, end_at)`
    yield* sql`
      CREATE TABLE calendar_syncs (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        synced_at TEXT NOT NULL,
        from_at TEXT NOT NULL,
        to_at TEXT NOT NULL
      ) STRICT`
  })
}
