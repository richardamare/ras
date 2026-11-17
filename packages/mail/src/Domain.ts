import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as Base64Url from "effect/encoding/Base64Url"
import * as Time from "@ras/kernel/Time"

/** A message's address in iCloud Mail: its folder, the folder's UIDVALIDITY and the message's UID. */
export interface MessageRef {
  readonly folder: string
  readonly uidValidity: number
  readonly uid: number
}

/** A message as `{folder in base64url}.{uidValidity}.{uid}`, the id the tools carry between calls. */
export const MessageId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]+\.[1-9]\d*\.[1-9]\d*$/)).pipe(
  Schema.brand("MessageId")
)
export type MessageId = typeof MessageId.Type

export const messageId = (ref: MessageRef): MessageId =>
  MessageId.make(`${Base64Url.encode(ref.folder)}.${ref.uidValidity}.${ref.uid}`)

export const messageRef = (id: MessageId): Option.Option<MessageRef> => {
  const [folder, uidValidity, uid] = id.split(".") as [string, string, string]
  return Option.map(Result.getSuccess(Base64Url.decode(folder)), (bytes) => ({
    folder: new TextDecoder().decode(bytes),
    uidValidity: Number(uidValidity),
    uid: Number(uid)
  }))
}

export const inbox = "INBOX"

const Folder = Schema.String.check(Schema.isNonEmpty()).annotate({
  description: "The folder as iCloud names it, such as INBOX or Archive. Left out, INBOX."
})

const Limit = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 })).annotate({
  description: "Most messages to answer, from 1 to 50. Left out, 20."
})

export const Search = Schema.Struct({
  query: Schema.String.check(Schema.isTrimmed(), Schema.isNonEmpty()).annotate({
    description: "Words the subject, the sender or the body contains."
  }),
  folder: Schema.optionalKey(Folder),
  since: Schema.optionalKey(Time.PragueDate).annotate({ description: "The first Prague day to include." }),
  until: Schema.optionalKey(Time.PragueDate).annotate({ description: "The last Prague day to include." }),
  limit: Schema.optionalKey(Limit)
})
export type Search = typeof Search.Type

export const Recent = Schema.Struct({ folder: Schema.optionalKey(Folder), limit: Schema.optionalKey(Limit) })
export type Recent = typeof Recent.Type

export class Summary extends Schema.Class<Summary>("MailSummary")({
  id: MessageId,
  sent: Time.PragueLocal,
  from: Schema.String,
  to: Schema.String,
  subject: Schema.String,
  snippet: Schema.String.annotate({ description: "The start of the text, on one line." }),
  pdf: Schema.Boolean.annotate({ description: "Whether it has a PDF attachment, which mail_attachments returns." })
}) {}

export class Attachment extends Schema.Class<Attachment>("MailAttachment")({
  name: Schema.String,
  mimeType: Schema.String,
  size: Schema.Int.annotate({ description: "Bytes, as the server reports them." }),
  pdf: Schema.Boolean
}) {}

export class Message extends Schema.Class<Message>("MailMessage")({
  id: MessageId,
  sent: Time.PragueLocal,
  from: Schema.String,
  to: Schema.String,
  cc: Schema.String,
  subject: Schema.String,
  body: Schema.String.annotate({ description: "The plain text, or the HTML turned into text." }),
  attachments: Schema.Array(Attachment)
}) {}

export class File extends Schema.Class<File>("MailFile")({
  name: Schema.String,
  mimeType: Schema.String,
  content: Schema.String.annotate({ description: "The file, base64-encoded." })
}) {}

export class Files extends Schema.Class<Files>("MailFiles")({
  files: Schema.Array(File),
  skipped: Schema.Array(Schema.String).annotate({
    description: "The PDFs left out because the answer holds at most 10 MB; open the message in Apple Mail for them."
  })
}) {}
