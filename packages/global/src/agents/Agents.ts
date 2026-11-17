import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Errors from "@ras/kernel/Errors"
import * as Actor from "../audit/Actor.ts"
import * as Agent from "./Agent.ts"
import * as AgentRepository from "./AgentRepository.ts"
import * as Writes from "../audit/Writes.ts"

/** The named actors the owner's bots act as. An agent is archived, never deleted, so its history keeps its name. */
export class Agents extends Context.Service<
  Agents,
  {
    readonly list: Effect.Effect<ReadonlyArray<Agent.Agent>>
    readonly add: (
      slug: Actor.AgentSlug,
      name: string
    ) => Effect.Effect<Agent.Agent, Errors.Refused, Actor.CurrentActor>
    readonly archive: (slug: Actor.AgentSlug) => Effect.Effect<Agent.Agent, Errors.NotFound, Actor.CurrentActor>
    /** The agent `slug` names, when it exists and is not archived. */
    readonly active: (slug: string) => Effect.Effect<Agent.Agent, Errors.Refused>
  }
>()("@ras/global/Agents") {
  static readonly layer = Layer.effect(
    Agents,
    Effect.gen(function* () {
      const writes = yield* Writes.Writes
      const agents = yield* AgentRepository.AgentRepository

      const active = (slug: string) =>
        Effect.flatMap(agents.bySlug(slug), (found) =>
          Option.match(found, {
            onNone: () =>
              Effect.fail(
                new Errors.Refused({
                  code: "global.agent.unknown",
                  reason: `ras has no agent ${slug}.`,
                  instead: "Call `agents` for the agents there are, or omit `agent` to act as the owner."
                })
              ),
            onSome: (agent) =>
              agent.archived
                ? Effect.fail(
                    new Errors.Refused({
                      code: "global.agent.archived",
                      reason: `The agent ${slug} is archived.`,
                      instead: "Ask the owner to restore it, or act as another agent."
                    })
                  )
                : Effect.succeed(agent)
          })
        )

      return Agents.of({
        list: agents.all,
        add: (slug, name) =>
          Effect.gen(function* () {
            if (Option.isSome(yield* agents.bySlug(slug))) {
              return yield* new Errors.Refused({
                code: "global.agent.exists",
                reason: `The agent ${slug} exists.`,
                instead: "Pick another slug."
              })
            }
            const agent = new Agent.Agent({ slug, name, archived: false })
            return yield* writes.run(
              "global.agent.added",
              agents.insert(agent).pipe(
                Effect.as({
                  result: agent,
                  subject: `agent/${slug}`,
                  before: Option.none(),
                  after: Option.some({ slug, name })
                })
              )
            )
          }),
        archive: (slug) =>
          Effect.gen(function* () {
            const found = yield* agents.bySlug(slug)
            if (Option.isNone(found)) return yield* new Errors.NotFound({ subject: "agent", id: slug })
            if (found.value.archived) return found.value
            const at = DateTime.formatIso(yield* DateTime.now)
            return yield* writes.run(
              "global.agent.archived",
              agents.archive(slug, at).pipe(
                Effect.as({
                  result: new Agent.Agent({ ...found.value, archived: true }),
                  subject: `agent/${slug}`,
                  before: Option.some({ archived: false }),
                  after: Option.some({ archived: true })
                })
              )
            )
          }),
        active
      })
    })
  ).pipe(Layer.provide(AgentRepository.AgentRepository.layer))
}
