import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Base64 from "effect/encoding/Base64"
import * as Imap from "imapflow"
import * as Errors from "@ras/kernel/Errors"
import * as Time from "@ras/kernel/Time"
import * as Message from "./Message.ts"
import * as Search from "./Search.ts"
import * as Text from "./Text.ts"

type Read<A> = Effect.Effect<A, Errors.NotFound | Errors.Invalid | Errors.SourceFailed>

/** iCloud Mail, read-only: nothing is sent, flagged, moved or marked read. */
export class Mailbox extends Context.Service<
  Mailbox,
  {
    /** The newest messages whose subject, sender or body contains the query, newest first. */
    readonly search: (search: Search.Search) => Read<ReadonlyArray<Message.Summary>>
    /** The newest messages of a folder, newest first. */
    readonly recent: (recent: Search.Recent) => Read<ReadonlyArray<Message.Summary>>
    readonly message: (id: Message.MessageId) => Read<Message.Message>
    /** The message's PDF attachments, up to 10 MB in one answer. */
    readonly attachments: (id: Message.MessageId) => Read<Message.Files>
  }
>()("@ras/mail/Mailbox") {}

const host = "imap.mail.me.com"
const defaultLimit = 20
const snippetLength = 200
/** The most PDF bytes one answer carries. */
const budget = 10 * 1024 * 1024

const failed = (reason: string) => new Errors.SourceFailed({ source: "icloud", reason })

const Pdf = "application/pdf"

/** What a message's parts hold, read from its body structure or the sample. */
interface Part {
  readonly id: string
  readonly type: string
  readonly name: Option.Option<string>
  readonly size: number
  readonly attachment: boolean
}

const isPdf = (part: Part) =>
  part.type === Pdf ||
  (part.type === "application/octet-stream" && Option.exists(part.name, (name) => name.toLowerCase().endsWith(".pdf")))

const attachmentOf = (part: Part) =>
  new Message.Attachment({
    name: Option.getOrElse(part.name, () => "attachment"),
    mimeType: part.type,
    size: part.size,
    pdf: isPdf(part)
  })

/** The part the text is read from: the plain-text one, else the HTML one. */
const textPart = (parts: ReadonlyArray<Part>) => {
  const body = parts.filter((part) => !part.attachment)
  return Option.orElse(Option.fromUndefinedOr(body.find((part) => part.type === "text/plain")), () =>
    Option.fromUndefinedOr(body.find((part) => part.type === "text/html"))
  )
}

const textOf = (part: Part, content: string) => (part.type === "text/html" ? Text.fromHtml(content) : content.trim())

const checkDays = (search: Search.Search) =>
  search.since !== undefined && search.until !== undefined && search.until < search.since
    ? Effect.fail(new Errors.Invalid({ reason: "`until` is before `since`. Give `until` on or after `since`." }))
    : Effect.void

const leaves = (node: Imap.MessageStructureObject): ReadonlyArray<Imap.MessageStructureObject> =>
  node.childNodes === undefined || node.childNodes.length === 0 ? [node] : node.childNodes.flatMap(leaves)

const partsOf = (structure: Imap.MessageStructureObject | undefined): ReadonlyArray<Part> =>
  structure === undefined
    ? []
    : leaves(structure).map((node) => {
        const name = Option.fromNullishOr(node.dispositionParameters?.["filename"] ?? node.parameters?.["name"])
        return {
          id: node.part ?? "1",
          type: node.type.toLowerCase(),
          name,
          size: node.size ?? 0,
          attachment: node.disposition?.toLowerCase() === "attachment" || Option.isSome(name)
        }
      })

const addresses = (list: ReadonlyArray<Imap.MessageAddressObject> | undefined) =>
  (list ?? [])
    .map((one) => (one.name ? `${one.name} <${one.address ?? ""}>` : (one.address ?? "")))
    .filter((one) => one.length > 0)
    .join(", ")

const sentOf = (message: Imap.FetchMessageObject) =>
  Time.toPragueLocal(DateTime.makeUnsafe(new Date(message.envelope?.date ?? message.internalDate ?? 0)))

/** IMAP's dates are whole days; a Prague day passes as that calendar date. */
const imapDay = (day: Time.PragueDate) => new Date(`${day}T00:00:00Z`)

const fetched = { uid: true, envelope: true, bodyStructure: true, internalDate: true } as const

const bytesOf = async (download: Imap.DownloadObject | Imap.DownloadNotFound) => {
  if (download.content === undefined) return new Uint8Array()
  const chunks: Array<Uint8Array> = []
  for await (const chunk of download.content) chunks.push(chunk as Uint8Array)
  return Buffer.concat(chunks)
}

/** The failure an IMAP error stands for; a folder the account lacks is not found. */
const failure = (folder: string) => (error: unknown) => {
  if (error instanceof Errors.NotFound) return error
  const { authenticationFailed, serverResponseCode, responseText } = (error ?? {}) as {
    authenticationFailed?: boolean
    serverResponseCode?: string
    responseText?: string
  }
  if (authenticationFailed === true)
    return failed(
      "iCloud refused ras's app-specific password. Create a new one at appleid.apple.com and set RAS_MAIL_APP_PASSWORD."
    )
  if (serverResponseCode === "NONEXISTENT" || /not exist|unknown mailbox|not found/i.test(responseText ?? ""))
    return new Errors.NotFound({ subject: "mail folder", id: folder })
  return failed("iCloud Mail could not be reached. Try again in a minute.")
}

export const make = (username: string, password: Redacted.Redacted) => {
  /** Signs in, opens one folder read-only, runs `use` and signs out, whatever `use` answers. */
  const inFolder = <A>(folder: string, use: (client: Imap.ImapFlow, box: Imap.MailboxObject) => Promise<A>) =>
    Effect.tryPromise({
      try: async () => {
        const client = new Imap.ImapFlow({
          host,
          port: 993,
          secure: true,
          auth: { user: username, pass: Redacted.value(password) },
          logger: false,
          disableAutoIdle: true,
          socketTimeout: 30_000
        })
        await client.connect()
        try {
          return await use(client, await client.mailboxOpen(folder, { readOnly: true }))
        } finally {
          await client.logout().catch(() => client.close())
        }
      },
      catch: failure(folder)
    }).pipe(
      Effect.tapError((error) =>
        error._tag === "SourceFailed" ? Effect.logWarning("iCloud Mail failed", folder, error.reason) : Effect.void
      ),
      Effect.withSpan("icloud", { attributes: { folder } })
    )

  const text = async (client: Imap.ImapFlow, uid: number, parts: ReadonlyArray<Part>, maxBytes?: number) =>
    Option.match(textPart(parts), {
      onNone: async () => "",
      onSome: async (part) =>
        textOf(
          part,
          new TextDecoder().decode(
            await bytesOf(
              await client.download(String(uid), part.id, {
                uid: true,
                ...(maxBytes === undefined ? {} : { maxBytes })
              })
            )
          )
        )
    })

  const summaries = async (
    client: Imap.ImapFlow,
    box: Imap.MailboxObject,
    folder: string,
    range: Imap.MessageRange
  ) => {
    const found: Array<Message.Summary> = []
    for (const message of await client.fetchAll(range, fetched, { uid: true })) {
      const parts = partsOf(message.bodyStructure)
      found.push(
        new Message.Summary({
          id: Message.messageId({ folder, uidValidity: Number(box.uidValidity), uid: message.uid }),
          sent: sentOf(message),
          from: addresses(message.envelope?.from),
          to: addresses(message.envelope?.to),
          subject: message.envelope?.subject ?? "",
          snippet: Text.snippet(await text(client, message.uid, parts, 64 * 1024), snippetLength),
          pdf: parts.some(isPdf)
        })
      )
    }
    return found.toSorted((a, b) => b.sent.localeCompare(a.sent))
  }

  /** The message at `id`, or not found when its folder's UIDVALIDITY moved on or the UID is gone. */
  const inMessage = <A>(
    id: Message.MessageId,
    use: (client: Imap.ImapFlow, message: Imap.FetchMessageObject, parts: ReadonlyArray<Part>) => Promise<A>
  ) =>
    Effect.flatMap(Errors.orNotFound("mail message", id)(Message.messageRef(id)), (ref) =>
      inFolder(ref.folder, async (client, box) => {
        const message =
          Number(box.uidValidity) === ref.uidValidity
            ? await client.fetchOne(String(ref.uid), fetched, { uid: true })
            : false
        if (message === false) throw new Errors.NotFound({ subject: "mail message", id })
        return use(client, message, partsOf(message.bodyStructure))
      })
    )

  return Mailbox.of({
    search: (search) =>
      Effect.andThen(checkDays(search), () => {
        const folder = search.folder ?? Search.inbox
        return inFolder(folder, async (client, box) => {
          const query = search.query
          const uids =
            (await client.search(
              {
                or: [{ subject: query }, { from: query }, { body: query }],
                ...(search.since === undefined ? {} : { sentSince: imapDay(search.since) }),
                ...(search.until === undefined ? {} : { sentBefore: imapDay(Time.addDays(search.until, 1)) })
              },
              { uid: true }
            )) || []
          const newest = uids.toSorted((a, b) => b - a).slice(0, search.limit ?? defaultLimit)
          return newest.length === 0 ? [] : summaries(client, box, folder, newest)
        })
      }),

    recent: (recent) => {
      const folder = recent.folder ?? Search.inbox
      return inFolder(folder, async (client, box) => {
        if (box.exists === 0) return []
        const first = Math.max(1, box.exists - (recent.limit ?? defaultLimit) + 1)
        const uids = (await client.search({ seq: `${first}:*` }, { uid: true })) || []
        return uids.length === 0 ? [] : summaries(client, box, folder, uids)
      })
    },

    message: (id) =>
      inMessage(
        id,
        async (client, message, parts) =>
          new Message.Message({
            id,
            sent: sentOf(message),
            from: addresses(message.envelope?.from),
            to: addresses(message.envelope?.to),
            cc: addresses(message.envelope?.cc),
            subject: message.envelope?.subject ?? "",
            body: await text(client, message.uid, parts),
            attachments: parts.filter((part) => part.attachment).map(attachmentOf)
          })
      ),

    attachments: (id) =>
      inMessage(id, async (client, message, parts) => {
        const files: Array<Message.File> = []
        const skipped: Array<string> = []
        let total = 0
        for (const part of parts.filter(isPdf)) {
          const name = attachmentOf(part).name
          if (total + part.size > budget) {
            skipped.push(name)
            continue
          }
          const bytes = await bytesOf(await client.download(String(message.uid), part.id, { uid: true }))
          total += bytes.length
          files.push(new Message.File({ name, mimeType: Pdf, content: Base64.encode(bytes) }))
        }
        return new Message.Files({ files, skipped })
      })
  })
}

/** iCloud Mail with the owner's Apple ID and app-specific password; without them, every read fails saying so. */
export const live = Layer.effect(
  Mailbox,
  Effect.gen(function* () {
    const username = yield* Config.option(Config.String("RAS_MAIL_USERNAME")).pipe(Effect.orDie)
    const password = yield* Config.option(Config.Redacted("RAS_MAIL_APP_PASSWORD")).pipe(Effect.orDie)
    if (Option.isNone(username) || Option.isNone(password)) {
      const unset = Effect.fail(
        failed(
          "iCloud Mail is not connected: ras has no Apple ID or app-specific password. Set RAS_MAIL_USERNAME and RAS_MAIL_APP_PASSWORD."
        )
      )
      return Mailbox.of({ search: () => unset, recent: () => unset, message: () => unset, attachments: () => unset })
    }
    return make(username.value, password.value)
  })
)

interface SampleMessage {
  readonly folder: string
  readonly uid: number
  /** Hours before the layer was built. */
  readonly hoursAgo: number
  readonly from: string
  readonly subject: string
  readonly body: string
  readonly pdf: Option.Option<string>
}

/** An invented mailbox: an invoice with its PDF, a note from a friend, a shipping notice and an archived receipt. */
const sampleMessages: ReadonlyArray<SampleMessage> = [
  {
    folder: Search.inbox,
    uid: 104,
    hoursAgo: 1,
    from: "Billing <billing@example.com>",
    subject: "Invoice 2026-118",
    body: "<p>Hello,</p><p>the invoice for October is attached.</p><p>Billing</p>",
    pdf: Option.some("invoice-2026-118.pdf")
  },
  {
    folder: Search.inbox,
    uid: 103,
    hoursAgo: 3,
    from: "Ada <ada@example.com>",
    subject: "Lunch on Friday?",
    body: "Are you free for lunch on Friday at noon?",
    pdf: Option.none()
  },
  {
    folder: Search.inbox,
    uid: 102,
    hoursAgo: 30,
    from: "Shop <orders@example.com>",
    subject: "Your order has shipped",
    body: "Your order 5521 is on its way and arrives on Thursday.",
    pdf: Option.none()
  },
  {
    folder: "Archive",
    uid: 7,
    hoursAgo: 400,
    from: "Shop <orders@example.com>",
    subject: "Receipt for order 5480",
    body: "Thank you for your order.",
    pdf: Option.some("receipt-5480.pdf")
  }
]

/** The bytes the sample serves as every PDF. */
export const samplePdf = new TextEncoder().encode("%PDF-1.4\n% invented\n%%EOF\n")

export const sample = Layer.effect(
  Mailbox,
  Effect.map(DateTime.now, (now) => {
    const sent = (message: SampleMessage) => Time.toPragueLocal(DateTime.subtract(now, { hours: message.hoursAgo }))
    const id = (message: SampleMessage) =>
      Message.messageId({ folder: message.folder, uidValidity: 1, uid: message.uid })
    const html = (message: SampleMessage) => message.body.startsWith("<")
    const body = (message: SampleMessage) => (html(message) ? Text.fromHtml(message.body) : message.body)
    const summary = (message: SampleMessage) =>
      new Message.Summary({
        id: id(message),
        sent: sent(message),
        from: message.from,
        to: "Owner <owner@example.com>",
        subject: message.subject,
        snippet: Text.snippet(body(message), snippetLength),
        pdf: Option.isSome(message.pdf)
      })
    const inFolder = (folder: string) =>
      sampleMessages.some((message) => message.folder === folder)
        ? Effect.succeed(sampleMessages.filter((message) => message.folder === folder))
        : Effect.fail(new Errors.NotFound({ subject: "mail folder", id: folder }))
    const found = (messageId: Message.MessageId) =>
      Errors.orNotFound(
        "mail message",
        messageId
      )(Option.fromUndefinedOr(sampleMessages.find((message) => id(message) === messageId)))
    const newest = (messages: ReadonlyArray<SampleMessage>, limit: number | undefined) =>
      messages
        .map(summary)
        .toSorted((a, b) => b.sent.localeCompare(a.sent))
        .slice(0, limit ?? defaultLimit)

    return Mailbox.of({
      search: (search) =>
        Effect.andThen(checkDays(search), () =>
          Effect.map(inFolder(search.folder ?? Search.inbox), (messages) => {
            const query = search.query.toLowerCase()
            const day = (message: SampleMessage) => sent(message).slice(0, 10)
            return newest(
              messages.filter(
                (message) =>
                  [message.subject, message.from, body(message)].some((field) => field.toLowerCase().includes(query)) &&
                  (search.since === undefined || day(message) >= search.since) &&
                  (search.until === undefined || day(message) <= search.until)
              ),
              search.limit
            )
          })
        ),
      recent: (recent) =>
        Effect.map(inFolder(recent.folder ?? Search.inbox), (messages) => newest(messages, recent.limit)),
      message: (messageId) =>
        Effect.map(
          found(messageId),
          (message) =>
            new Message.Message({
              ...summary(message),
              cc: "",
              body: body(message),
              attachments: Option.match(message.pdf, {
                onNone: () => [],
                onSome: (name) => [new Message.Attachment({ name, mimeType: Pdf, size: samplePdf.length, pdf: true })]
              })
            })
        ),
      attachments: (messageId) =>
        Effect.map(
          found(messageId),
          (message) =>
            new Message.Files({
              files: Option.match(message.pdf, {
                onNone: () => [],
                onSome: (name) => [new Message.File({ name, mimeType: Pdf, content: Base64.encode(samplePdf) })]
              }),
              skipped: []
            })
        )
    })
  })
)
