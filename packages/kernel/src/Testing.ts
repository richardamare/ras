import * as Effect from "effect/Effect"

/** The refusal's `code`, or the error's tag when it carries none. */
export const code = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.map(Effect.flip(effect), (error) => ("code" in error ? String(error.code) : error._tag))
