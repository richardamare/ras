import { assert, layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as SqlClient from "effect/sql/SqlClient"
import * as Errors from "@ras/kernel/Errors"
import * as Global from "@ras/global"
import * as Testing from "@ras/global/testing"
import * as AgentRepository from "../../src/agents/AgentRepository.ts"

const planner = Global.AgentSlug.make("planner")
const probe = Global.AgentSlug.make("probe")

const audited = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ n: number }>`SELECT count(*) AS n FROM global_audit_entries`
  return rows[0]?.n ?? 0
})

const entry = { subject: "agent", before: Option.none(), after: Option.none() }

layer(Layer.provideMerge(AgentRepository.AgentRepository.layer, Testing.layer([])))("AgentRepository", (test) => {
  test.effect("reads an agent it inserted", () =>
    Effect.gen(function* () {
      const agents = yield* AgentRepository.AgentRepository
      const writes = yield* Global.Writes
      yield* writes.run(
        "global.agent.added",
        Effect.as(agents.insert({ slug: planner, name: "Planner" }), { result: undefined, ...entry })
      )
      const found = yield* agents.bySlug(planner)
      assert.deepStrictEqual(
        Option.map(found, (agent) => [agent.slug, agent.name, agent.archived]),
        Option.some(["planner", "Planner", false])
      )
    })
  )

  test.effect("marks an agent archived", () =>
    Effect.gen(function* () {
      const agents = yield* AgentRepository.AgentRepository
      const writes = yield* Global.Writes
      yield* writes.run(
        "global.agent.archived",
        Effect.as(agents.archive(planner, "2026-11-17T12:00:00.000Z"), { result: undefined, ...entry })
      )
      assert.deepStrictEqual(
        Option.map(yield* agents.bySlug(planner), (agent) => agent.archived),
        Option.some(true)
      )
    })
  )

  test.effect("rolls an insert back with its audit entry when the write fails", () =>
    Effect.gen(function* () {
      const agents = yield* AgentRepository.AgentRepository
      const writes = yield* Global.Writes
      const before = yield* audited
      const failed = yield* writes
        .run(
          "global.agent.added",
          agents
            .insert({ slug: probe, name: "Probe" })
            .pipe(Effect.andThen(Effect.fail(new Errors.Refused({ code: "global.probe", reason: "no" }))))
        )
        .pipe(Effect.flip)
      assert.strictEqual(failed._tag, "Refused")
      assert.isTrue(Option.isNone(yield* agents.bySlug(probe)))
      assert.strictEqual(yield* audited, before)
    })
  )
})
