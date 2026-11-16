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

export const toolkit = Toolkit.make(
  read("whoami", {
    description: "Who ras sees: the owner, through which client, and the agent named, if any.",
    success: Http.Me
  })
)

export const handlers = toolkit.toLayer({ whoami: () => Http.me })
