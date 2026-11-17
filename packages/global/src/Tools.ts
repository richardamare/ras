import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Tool from "effect/ai/Tool"
import * as Toolkit from "effect/ai/Toolkit"
import * as Errors from "@ras/kernel/Errors"
import * as Actor from "./Actor.ts"
import * as Agents from "./Agents.ts"
import * as Http from "./Http.ts"
import * as Store from "./Store.ts"

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
  description: "The agent this call acts as, such as `scheduler`. Omit it when acting as the owner."
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

/**
 * Yields the function a writing tool's handler runs its effect through: as the agent the call named, refused when that
 * agent is unknown or archived, or as the caller when it named none.
 */
export const actingAs = Effect.map(
  Effect.service(Agents.Agents),
  (agents) =>
    (slug: Actor.AgentSlug | undefined) =>
    <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | Errors.Refused, R | Actor.CurrentActor> =>
      slug === undefined
        ? effect
        : Effect.flatMap(agents.active(slug), () =>
            Effect.updateService(
              effect,
              Actor.CurrentActor,
              (actor) => new Actor.Actor({ channel: actor.channel, agent: Option.some(slug) })
            )
          )
)

export const toolkit = Toolkit.make(
  read("whoami", {
    description: "Who ras sees: the owner, through which client, and the agent named, if any.",
    success: Http.Me
  }),
  read("agents", {
    description:
      "The agents a writing tool may name in `agent`: each one's slug and name. Archived agents are left out.",
    success: Schema.Array(Store.Agent)
  })
)

export const handlers = toolkit.toLayer(
  Effect.gen(function* () {
    const agents = yield* Agents.Agents
    return {
      whoami: () => Http.me,
      agents: () => Effect.map(agents.list, (all) => all.filter((one) => !one.archived))
    }
  })
)
