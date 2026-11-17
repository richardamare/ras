import * as Schema from "effect/Schema"
import * as Time from "@ras/kernel/Time"
import * as Calendar from "../calendars/Calendar.ts"
import * as Event from "./Event.ts"

export const Weekday = Schema.Literals(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])
export type Weekday = typeof Weekday.Type

/** How an event repeats: every `interval` days, weeks, months or years, until a day or for a count, or for ever. */
export const Repeat = Schema.Struct({
  every: Schema.Literals(["day", "week", "month", "year"]),
  interval: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 99 }))),
  on: Schema.optionalKey(Schema.NonEmptyArray(Weekday)).annotate({
    description: "The weekdays of a weekly repeat; the start's weekday when omitted."
  }),
  until: Schema.optionalKey(Time.PragueDate).annotate({ description: "The last day an occurrence may start on." }),
  count: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 999 }))).annotate({
    description: "How many occurrences, the first included."
  })
})
export type Repeat = typeof Repeat.Type

/** When an event happens: a start and an end in Prague local time, or whole Prague days. */
const When = {
  start: Schema.optionalKey(Time.PragueLocal).annotate({ description: "For a timed event." }),
  end: Schema.optionalKey(Time.PragueLocal).annotate({
    description: "For a timed event; an hour after the start when omitted."
  }),
  firstDay: Schema.optionalKey(Time.PragueDate).annotate({ description: "For an all-day event, instead of start." }),
  lastDay: Schema.optionalKey(Time.PragueDate).annotate({
    description: "The last day of an all-day event; the first day when omitted."
  })
}

export const NewEvent = Schema.Struct({
  title: Schema.String.check(Schema.isNonEmpty()),
  calendar: Schema.optionalKey(Calendar.CalendarId).annotate({
    description: "A writable calendar; left out, the one writable calendar when there is only one."
  }),
  ...When,
  location: Schema.optionalKey(Schema.String),
  notes: Schema.optionalKey(Schema.String),
  showAs: Schema.optionalKey(Event.ShowAs),
  repeat: Schema.optionalKey(Repeat),
  draft: Schema.optionalKey(Schema.Boolean).annotate({
    description: "Keeps the event in ras, where the owner confirms or discards it; a draft cannot repeat."
  })
})
export type NewEvent = typeof NewEvent.Type

export const EventChange = Schema.Struct({
  title: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty())),
  ...When,
  location: Schema.optionalKey(Schema.String),
  notes: Schema.optionalKey(Schema.String),
  showAs: Schema.optionalKey(Event.ShowAs)
})
export type EventChange = typeof EventChange.Type

export const Reply = Schema.Literals(["accept", "tentative", "decline"])
export type Reply = typeof Reply.Type

/** What the calendar's provider stored; it reaches search_calendar once Reclaim has read it, usually within a minute. */
export class Created extends Schema.Class<Created>("Created")({
  calendar: Calendar.CalendarId,
  title: Schema.String,
  start: Time.PragueLocal,
  end: Time.PragueLocal,
  allDay: Schema.Boolean,
  recurring: Schema.Boolean,
  link: Schema.NullOr(Schema.String),
  draft: Schema.NullOr(Event.EventId).annotate({ description: "The draft's id while the event is a draft in ras." })
}) {}
