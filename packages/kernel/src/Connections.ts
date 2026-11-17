import * as Arr from "effect/Array"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type * as Errors from "./Errors.ts"

export const Kind = Schema.Literals(["outlook", "reclaim", "icloud", "github"]).annotate({
  description: "Outlook through Graph, Reclaim, iCloud Mail, or the memory repository on GitHub."
})
export type Kind = typeof Kind.Type

export const State = Schema.Literals(["connected", "notConfigured", "failing", "sample"]).annotate({
  description:
    "`notConfigured` when a setting or a sign-in is missing, `failing` when the last check could not reach it, `sample` when invented data stands in."
})
export type State = typeof State.Type

export class Connection extends Schema.Class<Connection>("SourceConnection")({
  kind: Kind,
  state: State,
  detail: Schema.NullOr(Schema.String).annotate({
    description: "The account it is reached as when connected; otherwise what is missing or what failed."
  })
}) {}

/** One outside system a module reaches: its state from its settings, and a check that reaches it. */
export interface Source {
  readonly kind: Kind
  readonly state: Effect.Effect<Connection>
  readonly check: Effect.Effect<Connection>
}

export const connected = (kind: Kind, detail: string | null = null) =>
  new Connection({ kind, state: "connected", detail })

export const notConfigured = (kind: Kind, reason: string) =>
  new Connection({ kind, state: "notConfigured", detail: reason })

/**
 * A source whose `state` reads its settings; `check` reaches it with `probe`, the cheapest read, when it is
 * connected. In sample mode it is `sample` and never reached.
 */
export const source = (
  kind: Kind,
  state: Effect.Effect<Connection>,
  probe: Effect.Effect<unknown, Errors.SourceFailed>
): Effect.Effect<Source> =>
  Effect.map(Config.Boolean("RAS_SAMPLE").pipe(Config.withDefault(false), Effect.orDie), (sample) => {
    if (sample) {
      const invented = Effect.succeed(new Connection({ kind, state: "sample", detail: null }))
      return { kind, state: invented, check: invented }
    }
    return {
      kind,
      state,
      check: Effect.flatMap(state, (known) =>
        known.state === "connected"
          ? probe.pipe(
              Effect.as(known),
              Effect.catchTag("SourceFailed", (error) =>
                Effect.succeed(new Connection({ kind, state: "failing", detail: error.reason }))
              )
            )
          : Effect.succeed(known)
      )
    }
  })

/** The state of every outside system ras reaches, in a fixed order, and a check of one. */
export class Connections extends Context.Service<
  Connections,
  {
    readonly list: Effect.Effect<ReadonlyArray<Connection>>
    readonly check: (kind: Kind) => Effect.Effect<Connection>
  }
>()("@ras/kernel/Connections") {}

export const layer = <R>(sources: ReadonlyArray<Effect.Effect<Source, never, R>>): Layer.Layer<Connections, never, R> =>
  Layer.effect(
    Connections,
    Effect.map(Effect.all(sources), (built) => {
      const find = (kind: Kind) => Option.fromUndefinedOr(built.find((one) => one.kind === kind))
      return Connections.of({
        list: Effect.forEach(Arr.getSomes(Arr.map(Kind.literals, find)), (one) => one.state, {
          concurrency: "unbounded"
        }),
        check: (kind) =>
          Option.match(find(kind), {
            onNone: () => Effect.succeed(notConfigured(kind, "No module of ras reaches it.")),
            onSome: (one) => one.check
          })
      })
    })
  )
