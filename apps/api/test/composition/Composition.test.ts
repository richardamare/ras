import * as Fs from "node:fs"
import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient"
import { assert, describe, it } from "@effect/vitest"
import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import * as Order from "effect/Order"
import * as SqlClient from "effect/sql/SqlClient"
import * as Module from "@ras/kernel/Module"
import * as Api from "../../src/composition/Api.ts"
import * as Modules from "../../src/composition/Modules.ts"

const root = new URL("../../../../", import.meta.url)

const names = Modules.modules.map((module) => module.name)

describe("the module list", () => {
  it("names every module package", () => {
    const onDisk = Arr.filterMap(
      Arr.fromIterable(new Bun.Glob("packages/*/package.json").scanSync({ cwd: root.pathname })),
      (path) => {
        const manifest = JSON.parse(Fs.readFileSync(new URL(path, root), "utf8"))
        return manifest.exports?.["./module"] === undefined
          ? Result.failVoid
          : Result.succeed(manifest.name.replace("@ras/", ""))
      }
    )
    assert.deepStrictEqual(Arr.sort(onDisk, Order.String), Arr.sort(names, Order.String))
  })

  it.effect("lets each module create only tables named after it", () =>
    Effect.forEach(
      Modules.modules,
      (module) =>
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* Module.migrate([module])
          const tables = yield* sql<{ name: string }>`SELECT name FROM sqlite_master WHERE type = 'table'`
          for (const table of tables) assert.isTrue(table.name.startsWith(`${module.name}_`), table.name)
        }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:" }))),
      { discard: true }
    )
  )

  it("gives every tool a unique name", () => {
    const tools = Modules.modules.flatMap((module) => Object.keys(module.tools.toolkit.tools))
    assert.deepStrictEqual(tools, Arr.dedupe(tools))
  })

  it.effect("keeps .oas/api.json equal to the API", () =>
    Effect.gen(function* () {
      const committed = yield* Effect.promise(() => Bun.file(new URL(".oas/api.json", root)).json())
      assert.deepStrictEqual(committed, Api.openApi(), "run `bun run --cwd apps/api openapi > .oas/api.json`")
    })
  )
})
