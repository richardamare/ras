import * as Schema from "effect/Schema"
import * as Time from "@ras/kernel/Time"

export const ConfirmDrafts = Schema.Struct({
  drafts: Schema.optionalKey(Schema.NonEmptyArray(Schema.String)).annotate({
    description:
      "The drafts to confirm, by the ids search_calendar shows: an event draft's `id`, or a block draft's `block`."
  }),
  day: Schema.optionalKey(Time.PragueDate).annotate({ description: "Every draft that starts on this Prague day." })
})
export type ConfirmDrafts = typeof ConfirmDrafts.Type

export class DraftOutcome extends Schema.Class<DraftOutcome>("DraftOutcome")({
  id: Schema.String,
  title: Schema.String,
  start: Time.PragueLocal,
  refusal: Schema.NullOr(Schema.String).annotate({ description: "Why its calendar refused it; it stays a draft." })
}) {}

export class DraftsConfirmed extends Schema.Class<DraftsConfirmed>("DraftsConfirmed")({
  confirmed: Schema.Array(DraftOutcome),
  refused: Schema.Array(DraftOutcome)
}) {}
