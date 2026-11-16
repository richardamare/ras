import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient"
import { assert, describe, it } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as SqlClient from "effect/sql/SqlClient"
import * as Module from "../src/Module.ts"

class First extends Context.Service<First, { readonly value: number }>()("test/First") {}
class Second extends Context.Service<Second, { readonly value: number }>()("test/Second") {}
class Port extends Context.Service<Port, { readonly value: number }>()("test/Port") {}

const first = Module.make({
  name: "first",
  migrations: { "0001_create_rows": SqlClient.SqlClient.use((sql) => sql`CREATE TABLE first_rows (id TEXT)`) },
  services: Layer.effect(
    First,
    Effect.map(Effect.service(Port), (port) => ({ value: port.value + 1 }))
  )
})

const second = Module.make({
  name: "second",
  migrations: { "0001_create_rows": SqlClient.SqlClient.use((sql) => sql`CREATE TABLE second_rows (id TEXT)`) },
  services: Layer.effect(
    Second,
    Effect.map(Effect.service(First), (service) => ({ value: service.value * 10 }))
  ),
  ports: Layer.succeed(Port, { value: 1 })
})

const empty = Module.make({ name: "empty" })

const database = SqliteClient.layer({ filename: ":memory:" })

describe("Module", () => {
  it.effect("builds ports first, then each module's services in list order", () =>
    Effect.gen(function* () {
      assert.strictEqual((yield* Second).value, 20)
    }).pipe(Effect.provide(Module.services([first, second, empty] as const)))
  )

  it.effect("runs each module's migrations against its own table", () =>
    Effect.gen(function* () {
      yield* Module.migrate([first, second, empty])
      yield* Module.migrate([first, second, empty])
      const sql = yield* SqlClient.SqlClient
      const tables = yield* sql<{ name: string }>`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`
      assert.deepStrictEqual(
        tables.map((table) => table.name),
        ["empty_migrations", "first_migrations", "first_rows", "second_migrations", "second_rows"]
      )
    }).pipe(Effect.provide(database))
  )

  it("leaves a module without HTTP endpoints out of the API", () => {
    assert.deepStrictEqual(Object.keys(Module.api([first, empty]).groups), [])
  })
})
