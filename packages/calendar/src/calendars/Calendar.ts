import * as Schema from "effect/Schema"

/** Reclaim's id for a calendar. */
export const CalendarId = Schema.Int.check(Schema.isGreaterThan(0)).pipe(Schema.brand("CalendarId"))
export type CalendarId = typeof CalendarId.Type

export class Calendar extends Schema.Class<Calendar>("Calendar")({
  id: CalendarId,
  name: Schema.String,
  color: Schema.String,
  writable: Schema.Boolean.annotate({
    description:
      "A calendar of the Outlook account connected to ras, which takes plain events; any other only takes replies to invitations."
  }),
  enabled: Schema.Boolean
}) {}

export const CalendarChange = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean).annotate({
    description: "A calendar turned off is neither shown nor written."
  })
})
export type CalendarChange = typeof CalendarChange.Type
