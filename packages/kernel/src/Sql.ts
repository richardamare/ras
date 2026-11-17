import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

/** Every read decodes its rows; a row that does not decode is a defect of the store, not a failure of the caller. */
export const rows = <S extends Schema.Top, R>(schema: S, query: Effect.Effect<ReadonlyArray<unknown>, unknown, R>) =>
  query.pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(schema))), Effect.orDie)

export const first = <A>(found: ReadonlyArray<A>) => Option.fromUndefinedOr(found[0])
