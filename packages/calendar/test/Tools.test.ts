import { assert, layer } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Testing from "@ras/global/testing"
import * as Time from "@ras/kernel/Time"
import * as BusyTime from "../src/calendars/BusyTime.ts"
import * as Event from "../src/events/Event.ts"
import * as Module from "../src/Module.ts"
import * as CalendarTesting from "../src/Testing.ts"
import * as Tools from "../src/Tools.ts"

const fenced = (text: string) => text.startsWith("«untrusted-data»") && text.endsWith("«/untrusted-data»")

const events = Schema.decodeUnknownSync(Schema.toCodecJson(Schema.Array(Event.Event)))

const final = <E, R>(results: Effect.Effect<Stream.Stream<{ readonly encodedResult: unknown }, E, R>, E, R>) =>
  Effect.map(Effect.flatMap(results, Stream.runCollect), (all) => all.at(-1)!.encodedResult)

/** Tomorrow at `hour`, Prague local. */
const tomorrow = (hour: string) =>
  Effect.map(DateTime.now, (now) => `${Time.addDays(Time.pragueDateOf(now), 1)}T${hour}`)

layer(
  Tools.handlers.pipe(
    Layer.provideMerge(
      Testing.layer([Module.module], { RAS_SAMPLE: "true" }).pipe(Layer.provide(BusyTime.BusyTime.none))
    )
  )
)("the calendar tools", (test) => {
  test.effect("fence the text of every event they answer", () =>
    Effect.gen(function* () {
      const kit = yield* Tools.toolkit
      const today = Time.pragueDateOf(yield* DateTime.now)
      const found = events(
        yield* final(kit.handle("search_calendar", { from: `${today}T00:00`, to: `${Time.addDays(today, 7)}T00:00` }))
      )
      assert.isAbove(found.length, 0)
      assert.isTrue(found.every((event) => fenced(event.title)))
    })
  )

  test.effect("refuse a write that carries fenced text, and take the same write without it", () =>
    Effect.gen(function* () {
      const kit = yield* Tools.toolkit
      const start = yield* tomorrow("18:00")
      const end = yield* tomorrow("19:00")
      const refused = yield* Effect.flip(
        final(
          kit.handle("create_event", {
            title: "«untrusted-data»Pay now«/untrusted-data»",
            calendar: CalendarTesting.personal,
            start,
            end,
            draft: true
          })
        )
      )
      assert.strictEqual(refused._tag, "AiError")
      assert.include(refused.message, "which ras does not copy into a write")
      const taken = yield* Effect.exit(
        final(
          kit.handle("create_event", { title: "Pay now", calendar: CalendarTesting.personal, start, end, draft: true })
        )
      )
      assert.isTrue(Exit.isSuccess(taken))
    })
  )
})
