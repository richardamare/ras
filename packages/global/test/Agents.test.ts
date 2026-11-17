import { assert, layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Global from "@ras/global"
import * as Testing from "@ras/global/testing"

const kalendarnik = Global.AgentSlug.make("kalendarnik")
const ghost = Global.AgentSlug.make("ghost")

const code = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.map(Effect.flip(effect), (error) => ("code" in error ? String(error.code) : error._tag))

const whoActs = Effect.map(Effect.service(Global.CurrentActor), (actor) => Option.getOrNull(actor.agent))

layer(Testing.layer([]))("Agents", (test) => {
  test.effect("adds an agent once and refuses the same slug again", () =>
    Effect.gen(function* () {
      const agents = yield* Global.Agents
      const added = yield* agents.add(kalendarnik, "Kalendářník")
      assert.deepStrictEqual([added.slug, added.name, added.archived], ["kalendarnik", "Kalendářník", false])
      assert.strictEqual(yield* code(agents.add(kalendarnik, "Again")), "global.agent.exists")
    })
  )

  test.effect("runs a write as an active agent and refuses an unknown one", () =>
    Effect.gen(function* () {
      const actingAs = yield* Global.actingAs
      assert.strictEqual(yield* whoActs.pipe(actingAs(kalendarnik)), "kalendarnik")
      assert.strictEqual(yield* whoActs.pipe(actingAs(undefined)), null)
      assert.strictEqual(yield* code(whoActs.pipe(actingAs(ghost))), "global.agent.unknown")
    })
  )

  test.effect("refuses an archived agent and still lists it", () =>
    Effect.gen(function* () {
      const agents = yield* Global.Agents
      const actingAs = yield* Global.actingAs
      assert.isTrue((yield* agents.archive(kalendarnik)).archived)
      assert.strictEqual(yield* code(whoActs.pipe(actingAs(kalendarnik))), "global.agent.archived")
      assert.deepStrictEqual(
        (yield* agents.list).map((agent) => [agent.slug, agent.archived]),
        [["kalendarnik", true]]
      )
      assert.strictEqual(yield* code(agents.archive(ghost)), "NotFound")
    })
  )
})
