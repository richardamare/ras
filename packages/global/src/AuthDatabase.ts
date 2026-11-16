import * as Effect from "effect/Effect"
import * as SqlClient from "effect/sql/SqlClient"
import * as Kysely from "kysely"

/**
 * A Kysely dialect that runs every query through the Effect SQLite client. bun:sqlite is synchronous, so a second
 * connection to the same file would block the event loop while an Effect transaction holds the write lock.
 */
export const dialect = Effect.gen(function* () {
  const services = yield* Effect.context<SqlClient.SqlClient>()
  const run = <A>(effect: Effect.Effect<A, unknown, SqlClient.SqlClient>) =>
    Effect.runPromise(Effect.provideContext(effect, services))

  const connection: Kysely.DatabaseConnection = {
    executeQuery: async <R>(query: Kysely.CompiledQuery) => ({
      rows: (await run(
        SqlClient.SqlClient.use((sql) => sql.unsafe(query.sql, query.parameters as Array<unknown>))
      )) as Array<R>
    }),
    streamQuery: () => {
      throw new Error("better-auth does not stream queries")
    }
  }

  const driver: Kysely.Driver = {
    init: async () => {},
    acquireConnection: async () => connection,
    releaseConnection: async () => {},
    beginTransaction: async () => {
      throw new Error("better-auth runs with transaction: false")
    },
    commitTransaction: async () => {},
    rollbackTransaction: async () => {},
    destroy: async () => {}
  }

  return {
    createAdapter: () => new Kysely.SqliteAdapter(),
    createDriver: () => driver,
    createQueryCompiler: () => new Kysely.SqliteQueryCompiler(),
    createIntrospector: (db: Kysely.Kysely<unknown>) => new Kysely.SqliteIntrospector(db)
  } satisfies Kysely.Dialect
})
