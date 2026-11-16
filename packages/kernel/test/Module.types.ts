import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Module from "../src/Module.ts"

class First extends Context.Service<First, { readonly value: number }>()("types/First") {}
class Second extends Context.Service<Second, { readonly value: number }>()("types/Second") {}

const first = Module.make({ name: "first", services: Layer.succeed(First, { value: 1 }) })
const second = Module.make({
  name: "second",
  services: Layer.effect(
    Second,
    Effect.map(Effect.service(First), (service) => service)
  )
})

export const ordered: Layer.Layer<First | Second> = Module.services([first, second] as const)

// @ts-expect-error second calls first, so listing second before first fails the build
export const outOfOrder = Module.services([second, first] as const)
