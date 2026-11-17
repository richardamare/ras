import { assert, layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Testing from "@ras/global/testing"
import * as Message from "../src/mailbox/Message.ts"
import * as Module from "../src/Module.ts"
import * as Tools from "../src/Tools.ts"

const fenced = (text: string) => text.startsWith("«untrusted-data»") && text.endsWith("«/untrusted-data»")

/** What the model receives from a call: its final result as the tool encodes it, read back with `decode`. */
const sent = <A, E, R>(
  decode: (encoded: unknown) => A,
  results: Effect.Effect<Stream.Stream<{ readonly encodedResult: unknown }, E, R>, E, R>
) => Effect.map(Effect.flatMap(results, Stream.runCollect), (all) => decode(all.at(-1)!.encodedResult))

const summaries = Schema.decodeUnknownSync(Schema.toCodecJson(Schema.Array(Message.Summary)))
const message = Schema.decodeUnknownSync(Schema.toCodecJson(Message.Message))

layer(Tools.handlers.pipe(Layer.provideMerge(Testing.layer([Module.module], { RAS_SAMPLE: "true" }))))(
  "the mail tools",
  (test) => {
    test.effect("fence every field a sender wrote", () =>
      Effect.gen(function* () {
        const kit = yield* Tools.toolkit
        const [summary] = yield* sent(summaries, kit.handle("recent_mail", { limit: 1 }))
        assert.isTrue([summary!.from, summary!.to, summary!.subject, summary!.snippet].every(fenced))
        const full = yield* sent(message, kit.handle("mail_message", { message: summary!.id }))
        assert.isTrue([full.from, full.to, full.subject, full.body].every(fenced))
      })
    )
  }
)
