import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Toolkit from "effect/ai/Toolkit"
import * as Global from "@ras/global"
import * as Fact from "./facts/Fact.ts"
import * as Memory from "./facts/Memory.ts"

export const toolkit = Toolkit.make(
  Global.read("memory_index", {
    description:
      "The facts in the owner's shared memory: each one's path, kind and one-line description, filtered by kind or folder. Also lists the files that are not valid facts, and the kinds registry.yaml defines: each kind's path pattern, file-name rule, required and optional properties, and who writes it. Read the kinds before memory_write.",
    parameters: Memory.Filter,
    success: Memory.Index
  }),
  Global.read("memory_read", {
    description:
      "The full text of facts by path, each with its version. Pass that version to memory_write to change a fact. A path that holds a file breaking its kind's rules comes back under `invalid` with the reason.",
    parameters: Schema.Struct({ paths: Schema.NonEmptyArray(Schema.String) }),
    success: Memory.Read
  }),
  Global.read("memory_search", {
    description: "Facts whose path, description or text holds every word of the query, best match first.",
    parameters: Schema.Struct({
      query: Schema.String,
      limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 })))
    }),
    success: Schema.Array(Fact.Hit)
  }),
  Global.writeTool("memory_write", {
    description:
      "Creates a fact, or changes one with the version memory_read returned. Its folder decides its kind, whose rules the properties must keep and who may write it; memory_index lists the kinds. Commits it to the memory repository under the owner's identity, naming the agent in the commit subject. Memory holds what no other source holds: never tasks, events or mail, and never a secret.",
    parameters: {
      path: Fact.Path,
      properties: Fact.Properties,
      text: Schema.String.annotate({ description: "Markdown." }),
      version: Schema.optionalKey(Fact.Version)
    },
    success: Memory.Written,
    destructive: false
  }),
  Global.writeTool("memory_delete", {
    description: "Deletes a fact, given the version memory_read returned. Only who may write its kind deletes it.",
    parameters: { path: Fact.Path, version: Fact.Version },
    destructive: true
  })
)

export const handlers = toolkit.toLayer(
  Effect.gen(function* () {
    const memory = yield* Memory.Memory
    const actingAs = yield* Global.actingAs
    return {
      memory_index: (filter) => memory.index(filter),
      memory_read: ({ paths }) => memory.read(paths),
      memory_search: ({ query, limit }) => memory.search(query, limit ?? 10),
      memory_write: ({ agent, version, ...draft }) =>
        memory.write(draft, Option.fromUndefinedOr(version)).pipe(actingAs(agent)),
      memory_delete: ({ agent, path, version }) => memory.remove(path, version).pipe(actingAs(agent))
    }
  })
)
