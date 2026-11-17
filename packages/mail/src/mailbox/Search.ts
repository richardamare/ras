import * as Schema from "effect/Schema"
import * as Time from "@ras/kernel/Time"

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
