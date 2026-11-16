import * as Context from "effect/Context"
import * as Schema from "effect/Schema"

export const AgentSlug = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]{1,31}$/)).pipe(Schema.brand("AgentSlug"))
export type AgentSlug = typeof AgentSlug.Type

/** How the owner reached ras: the console in a browser, or an MCP client they consented to. */
export const Channel = Schema.Union([
  Schema.TaggedStruct("Console", {}),
  Schema.TaggedStruct("Mcp", { clientId: Schema.String, clientName: Schema.String })
])
export type Channel = typeof Channel.Type

/** Every caller is the owner; `agent` is the agent a writing tool declared it acts as, never proven. */
export class Actor extends Schema.Class<Actor>("Actor")({
  channel: Channel,
  agent: Schema.Option(AgentSlug)
}) {}

/** Provided per request by the console session check and by the MCP token check, and by nothing else. */
export class CurrentActor extends Context.Service<CurrentActor, Actor>()("@ras/global/CurrentActor") {}
