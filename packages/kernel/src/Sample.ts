import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

/** The sample layer when `RAS_SAMPLE` is set, the live one otherwise. */
export const choose = <A, E1, R1, E2, R2>(layers: {
  readonly sample: Layer.Layer<A, E1, R1>
  readonly live: Layer.Layer<A, E2, R2>
}): Layer.Layer<A, E1 | E2, R1 | R2> =>
  Layer.unwrap(
    Effect.map(
      Config.Boolean("RAS_SAMPLE").pipe(Config.withDefault(false)),
      (sample): Layer.Layer<A, E1 | E2, R1 | R2> => (sample ? layers.sample : layers.live)
    ).pipe(Effect.orDie)
  )
