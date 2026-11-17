import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import type * as Errors from "@ras/kernel/Errors"
import * as Actor from "./Actor.ts"

const TransactionId: unique symbol = Symbol("@ras/global/Transaction")

/**
 * Proof that the code runs inside `Writes.run`: an open SQLite transaction whose audit entry commits with it. Only
 * this file can make one, so a store write, which requires it, compiles only inside `Writes.run`.
 */
export class Transaction extends Context.Service<Transaction, { readonly [TransactionId]: typeof TransactionId }>()(
  "@ras/global/Transaction"
) {}

/** Marks a store statement as a write: it then runs only inside `Writes.run`. */
export const write = <A, E, R>(statement: Effect.Effect<A, E, R>): Effect.Effect<A, E, R | Transaction> =>
  Effect.andThen(Effect.service(Transaction), statement)

/** `<module>.<subject>.<verb>`, such as `work.task.created`; each module lists its own as a `Schema.Literals`. */
export type Action = `${string}.${string}.${string}`

/** What a service method that writes returns: it fails with a kernel `Failure` and runs as the current actor. */
export type Write<A> = Effect.Effect<A, Errors.Failure, Actor.CurrentActor>

export type Snapshot = Readonly<Record<string, unknown>>

/** What a write changed. An update keeps only the fields that differ; `withheld` fields show as changed, never as text. */
export interface Change<A> {
  readonly result: A
  readonly subject: string
  readonly before: Option.Option<Snapshot>
  readonly after: Option.Option<Snapshot>
}

export const withheld = "[withheld]"

/** The JSON of a value through its schema, as the audit stores it. */
export const snapshot = <S extends Schema.Encoder<unknown>>(schema: S, value: S["Type"]): Snapshot =>
  Schema.encodeSync(schema as any)(value) as Snapshot

/** Keeps the fields that differ between `before` and `after`; a `withheld` field that changed reads `[withheld]`. */
export const changed = (
  before: Snapshot,
  after: Snapshot,
  hidden: ReadonlyArray<string> = []
): { readonly before: Snapshot; readonly after: Snapshot } => {
  const keys = Arr.dedupe([...Object.keys(before), ...Object.keys(after)]).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])
  )
  const shown = (side: Snapshot) =>
    Object.fromEntries(keys.map((key) => [key, hidden.includes(key) ? withheld : side[key]]))
  return { before: shown(before), after: shown(after) }
}

export class Writes extends Context.Service<
  Writes,
  {
    /**
     * Runs `body` in one SQLite transaction and appends its audit entry, with the current actor and the time, before
     * the commit; a failure rolls both back. Keep outside calls (Graph, git) out of `body`: they run before it, so the
     * write lock is held only for the statements.
     */
    readonly run: <A, E, R>(
      action: Action,
      body: Effect.Effect<Change<A>, E, R>
    ) => Effect.Effect<A, E, Exclude<R, Transaction> | Actor.CurrentActor>
  }
>()("@ras/global/Writes") {
  static readonly layer = Layer.effect(
    Writes,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const encodeActor = Schema.encodeSync(Actor.Actor)
      const proof = Transaction.of({ [TransactionId]: TransactionId })

      const run = <A, E, R>(action: Action, body: Effect.Effect<Change<A>, E, R>) =>
        Effect.gen(function* () {
          const actor = yield* Actor.CurrentActor
          const change = yield* Effect.provideService(body, Transaction, proof)
          const at = DateTime.formatIso(yield* DateTime.now)
          const actorJson = encodeActor(actor)
          yield* sql`
            INSERT INTO global_audit_entries (action, subject, before, after, channel, agent, at)
            VALUES (${action}, ${change.subject},
                    ${Option.match(change.before, { onNone: () => null, onSome: (value) => JSON.stringify(value) })},
                    ${Option.match(change.after, { onNone: () => null, onSome: (value) => JSON.stringify(value) })},
                    ${JSON.stringify(actorJson.channel)}, ${Option.getOrNull(actor.agent)}, ${at})`.pipe(Effect.orDie)
          return change.result
        }).pipe(sql.withTransaction, Effect.catchTag("SqlError", Effect.die), Effect.withSpan(action)) as Effect.Effect<
          A,
          E,
          Exclude<R, Transaction> | Actor.CurrentActor
        >

      return Writes.of({ run })
    })
  )
}
