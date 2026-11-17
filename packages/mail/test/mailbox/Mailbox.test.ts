import { assert, describe, it, layer } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Base64 from "effect/encoding/Base64"
import * as Result from "effect/Result"
import * as Testing from "@ras/global/testing"
import * as Time from "@ras/kernel/Time"
import * as Domain from "../src/Domain.ts"
import * as Mailbox from "../src/Mailbox.ts"
import * as Module from "../src/Module.ts"
import * as Text from "../src/Text.ts"

const failure = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.map(Effect.flip(effect), (error) => error._tag)

const today = Effect.map(DateTime.now, (now) => Time.pragueDateOf(now))

describe("a message id", () => {
  it("carries its folder, the folder's UIDVALIDITY and the UID, whatever the folder is named", () => {
    const ref = { folder: "Archiv/Účty 2026", uidValidity: 1700000000, uid: 42 }
    const id = Domain.messageId(ref)
    assert.match(id, /^[A-Za-z0-9_-]+\.1700000000\.42$/)
    assert.deepStrictEqual(Domain.messageRef(id), Option.some(ref))
  })
})

describe("mail text", () => {
  it("turns HTML into text, dropping what is hidden and keeping blocks on their own lines", () => {
    assert.strictEqual(
      Text.fromHtml(
        "<html><head><style>p{}</style></head><body><p>Hello&nbsp;Ada,</p><!-- tracking --><div>see&#32;you <b>Friday</b> &amp; bring&#x21;</div></body></html>"
      ),
      "Hello Ada,\n\nsee you Friday & bring!"
    )
  })

  it("cuts a snippet to its length on one line", () => {
    assert.strictEqual(Text.snippet("one\n\ntwo   three", 9), "one two …")
    assert.strictEqual(Text.snippet("short", 9), "short")
  })
})

layer(Testing.layer([Module.module], { RAS_SAMPLE: "true" }))("the mailbox", (test) => {
  test.effect("lists the inbox's newest messages first, today's at the top, each with the start of its text", () =>
    Effect.gen(function* () {
      const recent = yield* (yield* Mailbox.Mailbox).recent({})
      assert.deepStrictEqual(
        recent.map((message) => [message.subject, message.pdf]),
        [
          ["Invoice 2026-118", true],
          ["Lunch on Friday?", false],
          ["Your order has shipped", false]
        ]
      )
      const day = yield* today
      assert.isTrue(recent[1]!.sent <= recent[0]!.sent)
      assert.isTrue(recent.some((message) => message.sent.startsWith(day)))
      assert.strictEqual(recent[0]!.snippet, "Hello, the invoice for October is attached. Billing")
      assert.strictEqual((yield* (yield* Mailbox.Mailbox).recent({ limit: 1 })).length, 1)
    })
  )

  test.effect("finds messages by words in the sender or the body, within the days given", () =>
    Effect.gen(function* () {
      const mailbox = yield* Mailbox.Mailbox
      assert.deepStrictEqual(
        (yield* mailbox.search({ query: "orders@example" })).map((message) => message.subject),
        ["Your order has shipped"]
      )
      assert.deepStrictEqual(
        (yield* mailbox.search({ query: "order", folder: "Archive" })).map((message) => message.subject),
        ["Receipt for order 5480"]
      )
      const day = yield* today
      assert.deepStrictEqual(yield* mailbox.search({ query: "shipped", since: day, until: day }), [])
      assert.strictEqual(
        yield* failure(mailbox.search({ query: "x", since: day, until: Time.addDays(day, -1) })),
        "Invalid"
      )
      assert.strictEqual(yield* failure(mailbox.search({ query: "x", folder: "Nowhere" })), "NotFound")
    })
  )

  test.effect("returns a message in full with its attachments, and its PDF as a file", () =>
    Effect.gen(function* () {
      const mailbox = yield* Mailbox.Mailbox
      const [invoice] = yield* mailbox.search({ query: "invoice" })
      const message = yield* mailbox.message(invoice!.id)
      assert.deepStrictEqual(
        [message.from, message.body, message.attachments.map((attachment) => [attachment.name, attachment.pdf])],
        [
          "Billing <billing@example.com>",
          "Hello,\n\nthe invoice for October is attached.\n\nBilling",
          [["invoice-2026-118.pdf", true]]
        ]
      )
      const { files, skipped } = yield* mailbox.attachments(invoice!.id)
      assert.deepStrictEqual(skipped, [])
      assert.deepStrictEqual(Result.getSuccess(Base64.decode(files[0]!.content)), Option.some(Mailbox.samplePdf))
      const elsewhere = Domain.messageId({ folder: "Archive", uidValidity: 1, uid: 104 })
      assert.strictEqual(yield* failure(mailbox.message(elsewhere)), "NotFound")
    })
  )
})
