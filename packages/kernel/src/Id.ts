import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

/** The base of every id: a UUIDv7 that ras assigns before the write. `TaskId = Id.Uuid.pipe(Schema.brand("TaskId"))`. */
export const Uuid = Schema.String.check(Schema.isUUID())

export const generate = <A>(schema: { readonly make: (input: string) => A }): Effect.Effect<A> =>
  Effect.sync(() => schema.make(Bun.randomUUIDv7()))
