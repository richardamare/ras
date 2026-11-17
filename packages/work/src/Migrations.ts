import * as Effect from "effect/Effect"
import * as SqlClient from "effect/sql/SqlClient"
import type * as Module from "@ras/kernel/Module"

export const migrations: Module.Migrations = {
  "0001_create_board": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      CREATE TABLE work_spaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        position INTEGER NOT NULL,
        calendar TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        archived_at TEXT
      ) STRICT`
    yield* sql`CREATE UNIQUE INDEX work_spaces_one_default ON work_spaces (is_default) WHERE is_default = 1`
    yield* sql`
      INSERT INTO work_spaces (id, name, color, position, is_default)
      VALUES (${Bun.randomUUIDv7()}, 'Personal', '#884dff', 0, 1)`
    yield* sql`
      CREATE TABLE work_projects (
        id TEXT PRIMARY KEY,
        space_id TEXT NOT NULL REFERENCES work_spaces (id),
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        deadline TEXT,
        description TEXT
      ) STRICT`
    yield* sql`
      CREATE TABLE work_tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL,
        assignee TEXT NOT NULL,
        priority TEXT NOT NULL,
        deadline TEXT,
        estimate INTEGER,
        project_id TEXT REFERENCES work_projects (id),
        space_id TEXT NOT NULL REFERENCES work_spaces (id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        closed_at TEXT
      ) STRICT`
    yield* sql`CREATE INDEX work_tasks_assignee_status ON work_tasks (assignee, status)`
    yield* sql`CREATE INDEX work_tasks_updated_at ON work_tasks (updated_at)`
    yield* sql`
      CREATE TABLE work_comments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES work_tasks (id) ON DELETE CASCADE,
        author TEXT NOT NULL,
        at TEXT NOT NULL,
        text TEXT NOT NULL,
        link TEXT
      ) STRICT`
    yield* sql`CREATE INDEX work_comments_task ON work_comments (task_id, at)`
    yield* sql`
      CREATE TABLE work_links (
        task_id TEXT NOT NULL REFERENCES work_tasks (id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        PRIMARY KEY (task_id, url)
      ) STRICT`
  }),
  "0002_create_blocks": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      CREATE TABLE work_blocks (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES work_tasks (id),
        calendar_id INTEGER NOT NULL,
        start_at TEXT NOT NULL,
        end_at TEXT,
        event_id TEXT,
        CHECK (end_at IS NOT NULL OR event_id IS NOT NULL)
      ) STRICT`
    yield* sql`CREATE INDEX work_blocks_task ON work_blocks (task_id)`
    yield* sql`CREATE INDEX work_blocks_span ON work_blocks (start_at, end_at)`
    yield* sql`CREATE UNIQUE INDEX work_blocks_one_running ON work_blocks ((1)) WHERE end_at IS NULL`
  })
}
