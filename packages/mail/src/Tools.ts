import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Toolkit from "effect/ai/Toolkit"
import * as Global from "@ras/global"
import * as Untrusted from "@ras/kernel/Untrusted"
import * as Message from "./mailbox/Message.ts"
import * as Search from "./mailbox/Search.ts"
import * as Mailbox from "./mailbox/Mailbox.ts"

const MessageRef = Schema.Struct({
  message: Message.MessageId.annotate({ description: "The id search_mail or recent_mail gave." })
})

export const toolkit = Toolkit.make(
  Global.read("search_mail", {
    description:
      "The iCloud Mail messages whose subject, sender or body contains `query`, newest first: id, Prague send time, sender, recipients, subject, the start of the text and whether a PDF is attached. `since` and `until` bound the Prague days, both included. Read-only: nothing is marked read or moved.",
    parameters: Search.Search,
    success: Schema.Array(Message.Summary)
  }),
  Global.read("recent_mail", {
    description:
      "The newest messages of a folder, INBOX unless another is named, newest first, each as search_mail lists it. Read-only: nothing is marked read.",
    parameters: Search.Recent,
    success: Schema.Array(Message.Summary)
  }),
  Global.read("mail_message", {
    description:
      "One message in full: its headers, its text with HTML turned into text, and its attachments with name, type, size and whether each is a PDF. Read-only: the message stays unread.",
    parameters: MessageRef,
    success: Message.Message
  }),
  Global.read("mail_attachments", {
    description:
      "A message's PDF attachments as base64-encoded files, at most 10 MB in one answer; the PDFs that do not fit are named in `skipped`. Read-only.",
    parameters: MessageRef,
    success: Message.Files
  })
)

/** Every field a sender wrote, fenced for the model. */
const fencedSummary = (summary: Message.Summary) =>
  new Message.Summary({
    ...summary,
    from: Untrusted.fence(summary.from),
    to: Untrusted.fence(summary.to),
    subject: Untrusted.fence(summary.subject),
    snippet: Untrusted.fence(summary.snippet)
  })

const fencedMessage = (message: Message.Message) =>
  new Message.Message({
    ...message,
    from: Untrusted.fence(message.from),
    to: Untrusted.fence(message.to),
    cc: Untrusted.fence(message.cc),
    subject: Untrusted.fence(message.subject),
    body: Untrusted.fence(message.body),
    attachments: message.attachments.map(
      (attachment) => new Message.Attachment({ ...attachment, name: Untrusted.fence(attachment.name) })
    )
  })

const fencedFiles = (files: Message.Files) =>
  new Message.Files({
    files: files.files.map((file) => new Message.File({ ...file, name: Untrusted.fence(file.name) })),
    skipped: files.skipped.map(Untrusted.fence)
  })

export const handlers = toolkit.toLayer(
  Effect.gen(function* () {
    const mailbox = yield* Mailbox.Mailbox
    return {
      search_mail: (search) => Effect.map(mailbox.search(search), (found) => found.map(fencedSummary)),
      recent_mail: (recent) => Effect.map(mailbox.recent(recent), (found) => found.map(fencedSummary)),
      mail_message: ({ message }) => Effect.map(mailbox.message(message), fencedMessage),
      mail_attachments: ({ message }) => Effect.map(mailbox.attachments(message), fencedFiles)
    }
  })
)
