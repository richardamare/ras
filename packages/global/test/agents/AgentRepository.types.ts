import type * as Effect from "effect/Effect"
import type * as AgentRepository from "../../src/agents/AgentRepository.ts"
import type * as Actor from "../../src/audit/Actor.ts"

declare const agents: AgentRepository.AgentRepository["Service"]
declare const slug: Actor.AgentSlug

// @ts-expect-error a repository write needs the Transaction that only Writes.run provides
export const outside: Effect.Effect<void> = agents.insert({ slug, name: "Outside" })
