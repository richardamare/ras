import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Toolkit from "effect/ai/Toolkit"
import * as Global from "@ras/global"
import * as Fact from "./Fact.ts"
import * as Memory from "./Memory.ts"

export const toolkit = Toolkit.make(
  Global.read("memory_index", {
    description:
      "Every fact in the owner's shared memory: its name, one-line description and type. Lists the files that are not valid facts too.",
    success: Memory.Index
  }),
  Global.read("memory_read", {
    description:
      "The full text of facts by name, each with its version. Pass that version to memory_write to change a fact.",
    parameters: Schema.Struct({ names: Schema.NonEmptyArray(Schema.String) }),
    success: Memory.Read
  }),
  Global.read("memory_search", {
    description: "Facts whose name, description or text holds every word of the query, best match first.",
    parameters: Schema.Struct({
      query: Schema.String,
      limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 })))
    }),
    success: Schema.Array(Fact.Hit)
  }),
  Global.writeTool("memory_write", {
    description:
      "Creates a fact, or changes one with the version memory_read returned. Commits it to the memory repository as the agent named. Memory holds what no other source holds: never tasks, events or mail, and never a secret.",
    parameters: {
      name: Fact.Name.annotate({ description: "kebab-case, such as `coffee-order`" }),
      description: Schema.String.annotate({ description: "One line: what the index shows." }),
      type: Fact.Type,
      text: Schema.String.annotate({ description: "Markdown." }),
      version: Schema.optionalKey(Fact.Version)
    },
    success: Memory.Written,
    destructive: false
  }),
  Global.writeTool("memory_delete", {
    description: "Deletes a fact, given the version memory_read returned.",
    parameters: { name: Fact.Name, version: Fact.Version },
    destructive: true
  })
)

export const handlers = toolkit.toLayer(
  Effect.gen(function* () {
    const memory = yield* Memory.Memory
    const actingAs = yield* Global.actingAs
    return {
      memory_index: () => memory.index,
      memory_read: ({ names }) => memory.read(names),
      memory_search: ({ query, limit }) => memory.search(query, limit ?? 10),
      memory_write: ({ agent, version, ...draft }) =>
        memory.write(draft, Option.fromUndefinedOr(version)).pipe(actingAs(agent)),
      memory_delete: ({ agent, name, version }) => memory.remove(name, version).pipe(actingAs(agent))
    }
  })
)
