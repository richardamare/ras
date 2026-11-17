import * as Cause from "effect/Cause"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Queue from "effect/Queue"
import * as SqlClient from "effect/sql/SqlClient"
import * as Kysely from "kysely"

class RolledBack extends Data.TaggedError("RolledBack")<{}> {}

type Command =
  | {
      readonly _tag: "Query"
      readonly query: Kysely.CompiledQuery
      readonly reply: (exit: Exit.Exit<unknown, unknown>) => void
    }
  | { readonly _tag: "Commit" }
  | { readonly _tag: "Rollback" }

/**
 * A Kysely dialect that runs every query through the Effect SQLite client. bun:sqlite is synchronous, so a second
 * connection to the same file would block the event loop while an Effect transaction holds the write lock. A Kysely
 * transaction becomes an Effect `withTransaction` held open by a fiber that runs the queries sent to it.
 */
export const dialect = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const services = yield* Effect.context<SqlClient.SqlClient>()
  const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
    Effect.runPromise(Effect.provideContext(effect, services))

  const statement = (query: Kysely.CompiledQuery) => sql.unsafe(query.sql, query.parameters as Array<unknown>)

  const transaction = Effect.gen(function* () {
    const commands = yield* Queue.unbounded<Command>()
    const fiber = yield* Effect.forkDetach(
      sql.withTransaction(
        Effect.gen(function* () {
          while (true) {
            const command = yield* Queue.take(commands)
            if (command._tag === "Commit") return
            if (command._tag === "Rollback") return yield* new RolledBack()
            command.reply(yield* Effect.exit(statement(command.query)))
          }
        })
      )
    )
    return { commands, fiber }
  })

  const connection = (): Kysely.DatabaseConnection & {
    begin: () => Promise<void>
    end: (outcome: "Commit" | "Rollback") => Promise<void>
  } => {
    let open: Effect.Success<typeof transaction> | undefined
    return {
      executeQuery: async <R>(query: Kysely.CompiledQuery) => {
        if (open === undefined) return { rows: (await run(statement(query))) as Array<R> }
        const commands = open.commands
        const exit = await new Promise<Exit.Exit<unknown, unknown>>((reply) =>
          Effect.runSync(Queue.offer(commands, { _tag: "Query", query, reply }))
        )
        if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
        return { rows: exit.value as Array<R> }
      },
      streamQuery: () => {
        throw new Error("better-auth does not stream queries")
      },
      begin: async () => {
        open = await run(transaction)
      },
      end: async (outcome) => {
        if (open === undefined) return
        const { commands, fiber } = open
        open = undefined
        Effect.runSync(Queue.offer(commands, { _tag: outcome }))
        const exit = await Effect.runPromise(Fiber.await(fiber))
        if (outcome === "Commit" && Exit.isFailure(exit)) throw Cause.squash(exit.cause)
      }
    }
  }

  type Connection = ReturnType<typeof connection>

  const driver: Kysely.Driver = {
    init: async () => {},
    acquireConnection: async () => connection(),
    releaseConnection: async () => {},
    beginTransaction: (opened) => (opened as Connection).begin(),
    commitTransaction: (opened) => (opened as Connection).end("Commit"),
    rollbackTransaction: (opened) => (opened as Connection).end("Rollback"),
    destroy: async () => {}
  }

  return {
    createAdapter: () => new Kysely.SqliteAdapter(),
    createDriver: () => driver,
    createQueryCompiler: () => new Kysely.SqliteQueryCompiler(),
    createIntrospector: (db: Kysely.Kysely<unknown>) => new Kysely.SqliteIntrospector(db)
  } satisfies Kysely.Dialect
})
