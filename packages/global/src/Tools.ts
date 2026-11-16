import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Tool from "effect/ai/Tool"
import * as Toolkit from "effect/ai/Toolkit"
import * as Errors from "@ras/kernel/Errors"
import * as Actor from "./Actor.ts"
import * as Http from "./Http.ts"

/** A tool that only reads. It fails only with the kernel's `Failure`. */
export const read = <
  const Name extends string,
  Parameters extends Schema.Constraint = typeof Tool.EmptyParams,
  Success extends Schema.Constraint = typeof Schema.Void
>(
  name: Name,
  options: { readonly description: string; readonly parameters?: Parameters; readonly success?: Success }
) =>
  Tool.make(name, { ...options, failure: Errors.Failure, dependencies: [Actor.CurrentActor] })
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.OpenWorld, false)

const agent = Schema.optionalKey(Actor.AgentSlug).annotate({
  description: "The agent this call acts as, such as `kalendarnik`. Omit it when acting as the owner."
})

/** A tool that writes. Its parameters carry the optional `agent`; the handler passes it to `actingAs`. */
export const write = <
  const Name extends string,
  const Fields extends Schema.Struct.Fields,
  Success extends Schema.Constraint = typeof Schema.Void
>(
  name: Name,
  options: {
    readonly description: string
    readonly parameters: Fields
    readonly success?: Success
    readonly destructive: boolean
  }
) =>
  Tool.make(name, {
    description: options.description,
    parameters: Schema.Struct({ ...options.parameters, agent }),
    ...(options.success === undefined ? {} : { success: options.success }),
    failure: Errors.Failure,
    dependencies: [Actor.CurrentActor]
  })
    .annotate(Tool.Readonly, false)
    .annotate(Tool.Destructive, options.destructive)
    .annotate(Tool.OpenWorld, false)

/** Runs `effect` as the agent a writing tool named, or as the caller when it named none. */
export const actingAs =
  (slug: Actor.AgentSlug | undefined) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.updateService(
      effect,
      Actor.CurrentActor,
      (actor) => new Actor.Actor({ channel: actor.channel, agent: Option.fromUndefinedOr(slug) })
    )

export const toolkit = Toolkit.make(
  read("whoami", {
    description: "Who ras sees: the owner, through which client, and the agent named, if any.",
    success: Http.Me
  })
)

export const handlers = toolkit.toLayer({ whoami: () => Http.me })
