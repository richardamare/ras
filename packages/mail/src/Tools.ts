import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Toolkit from "effect/ai/Toolkit"
import * as Global from "@ras/global"
import * as Domain from "./Domain.ts"
import * as Mailbox from "./mailbox/Mailbox.ts"

const MessageRef = Schema.Struct({
  message: Domain.MessageId.annotate({ description: "The id search_mail or recent_mail gave." })
})

export const toolkit = Toolkit.make(
  Global.read("search_mail", {
    description:
      "The iCloud Mail messages whose subject, sender or body contains `query`, newest first: id, Prague send time, sender, recipients, subject, the start of the text and whether a PDF is attached. `since` and `until` bound the Prague days, both included. Read-only: nothing is marked read or moved.",
    parameters: Domain.Search,
    success: Schema.Array(Domain.Summary)
  }),
  Global.read("recent_mail", {
    description:
      "The newest messages of a folder, INBOX unless another is named, newest first, each as search_mail lists it. Read-only: nothing is marked read.",
    parameters: Domain.Recent,
    success: Schema.Array(Domain.Summary)
  }),
  Global.read("mail_message", {
    description:
      "One message in full: its headers, its text with HTML turned into text, and its attachments with name, type, size and whether each is a PDF. Read-only: the message stays unread.",
    parameters: MessageRef,
    success: Domain.Message
  }),
  Global.read("mail_attachments", {
    description:
      "A message's PDF attachments as base64-encoded files, at most 10 MB in one answer; the PDFs that do not fit are named in `skipped`. Read-only.",
    parameters: MessageRef,
    success: Domain.Files
  })
)

export const handlers = toolkit.toLayer(
  Effect.gen(function* () {
    const mailbox = yield* Mailbox.Mailbox
    return {
      search_mail: (search) => mailbox.search(search),
      recent_mail: (recent) => mailbox.recent(recent),
      mail_message: ({ message }) => mailbox.message(message),
      mail_attachments: ({ message }) => mailbox.attachments(message)
    }
  })
)
