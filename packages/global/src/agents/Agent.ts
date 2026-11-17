import * as Schema from "effect/Schema"
import * as Actor from "../audit/Actor.ts"

export class Agent extends Schema.Class<Agent>("Agent")({
  slug: Actor.AgentSlug,
  name: Schema.String,
  archived: Schema.Boolean
}) {}
