import * as Schema from "effect/Schema"
import * as Calendar from "@ras/calendar"
import * as Id from "@ras/kernel/Id"

export const SpaceId = Id.Uuid.pipe(Schema.brand("SpaceId"))
export type SpaceId = typeof SpaceId.Type

export const Color = Schema.String.check(Schema.isPattern(/^#[0-9a-f]{6}$/))

export class Space extends Schema.Class<Space>("Space")({
  id: SpaceId,
  name: Schema.String,
  color: Color,
  position: Schema.Int,
  /** The calendar its work blocks are written to, one of the connected Outlook account. */
  calendar: Schema.NullOr(Calendar.CalendarId),
  default: Schema.Boolean,
  archived: Schema.Boolean
}) {}

export const NewSpace = Schema.Struct({
  name: Schema.String.check(Schema.isNonEmpty()),
  color: Color
})

export const SpaceChange = Schema.Struct({
  name: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty())),
  color: Schema.optionalKey(Color),
  position: Schema.optionalKey(Schema.Int),
  calendar: Schema.optionalKey(Schema.NullOr(Calendar.CalendarId)).annotate({
    description: "The calendar the space's work blocks are written to, one of the connected Outlook account."
  }),
  default: Schema.optionalKey(Schema.Literal(true)).annotate({ description: "Makes this the default space." })
})
