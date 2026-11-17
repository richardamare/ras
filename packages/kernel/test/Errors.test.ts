import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Errors from "../src/Errors.ts"

describe("Errors", () => {
  it.effect("answers the value of a found option", () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* Errors.orNotFound("task", "t1")(Option.some(1)), 1)
    })
  )

  it.effect("fails with NotFound for the subject and id when nothing was found", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(Errors.orNotFound("task", "t1")(Option.none()))
      assert.deepStrictEqual([error._tag, error.subject, error.id], ["NotFound", "task", "t1"])
    })
  )
})
