import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Time from "@ras/kernel/Time"

/** Reclaim's id for a calendar. */
export const CalendarId = Schema.Int.check(Schema.isGreaterThan(0)).pipe(Schema.brand("CalendarId"))
export type CalendarId = typeof CalendarId.Type

/**
 * `personal` is a calendar of the owner's Outlook account, which Graph writes; `work` is reached only through Reclaim;
 * `copy` is written by Calendar Sync; `unmarked` has no role yet and takes nothing.
 */
export const Role = Schema.Literals(["personal", "work", "copy", "unmarked"])
export type Role = typeof Role.Type

/** Who owns an event: its calendar's own account, someone who invited it, Calendar Sync, or Reclaim itself. */
export const Kind = Schema.Literals(["plain", "invitation", "copy", "reclaim"])
export type Kind = typeof Kind.Type

export const ShowAs = Schema.Literals(["free", "tentative", "busy", "oof", "workingElsewhere"])
export type ShowAs = typeof ShowAs.Type

export const Rsvp = Schema.Literals(["none", "needsAction", "accepted", "tentative", "declined"])
export type Rsvp = typeof Rsvp.Type

/**
 * An event as `{calendar}.{yyyymmdd}.{id}`: its calendar, the Prague day it starts on, which bounds the read that finds
 * it again, and its id in the calendar.
 */
export const EventId = Schema.String.check(Schema.isPattern(/^\d+\.\d{8}\..+$/)).pipe(Schema.brand("EventId"))
export type EventId = typeof EventId.Type

export interface EventRef {
  readonly calendar: CalendarId
  readonly date: Time.PragueDate
  readonly id: string
}

export const eventId = (ref: EventRef): EventId =>
  EventId.make(`${ref.calendar}.${ref.date.replaceAll("-", "")}.${ref.id}`)

export const eventRef = (id: EventId): EventRef => {
  const [calendar, day] = id.split(".", 2) as [string, string]
  return {
    calendar: CalendarId.make(Number(calendar)),
    date: Time.PragueDate.make(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`),
    id: id.slice(calendar.length + day.length + 2)
  }
}

export class Calendar extends Schema.Class<Calendar>("Calendar")({
  id: CalendarId,
  name: Schema.String,
  color: Schema.String,
  role: Role,
  enabled: Schema.Boolean
}) {}

export const CalendarChange = Schema.Struct({
  role: Schema.optionalKey(Role),
  enabled: Schema.optionalKey(Schema.Boolean).annotate({
    description: "A calendar turned off is neither shown nor written."
  })
})
export type CalendarChange = typeof CalendarChange.Type

export class Attendee extends Schema.Class<Attendee>("Attendee")({
  name: Schema.NullOr(Schema.String),
  email: Schema.NullOr(Schema.String),
  rsvp: Rsvp,
  organizer: Schema.Boolean,
  optional: Schema.Boolean
}) {}

/** A window of Prague local time, its end after its start. */
export const Window = Schema.Struct({
  from: Time.PragueLocal,
  to: Time.PragueLocal
})
export type Window = typeof Window.Type

export interface Span {
  readonly start: DateTime.Utc
  readonly end: DateTime.Utc
}

/** An event as a source holds it, its span in instants; an all-day event spans Prague midnight to Prague midnight. */
export interface Entry {
  readonly ref: EventRef
  readonly title: string
  readonly span: Span
  readonly allDay: boolean
  readonly kind: Kind
  readonly showAs: ShowAs
  readonly rsvp: Rsvp
  readonly cancelled: boolean
  readonly recurring: boolean
  readonly location: Option.Option<string>
  readonly category: Option.Option<string>
  readonly notes: Option.Option<string>
  readonly attendees: ReadonlyArray<Attendee>
  /** For a copy Calendar Sync wrote, the event it copies. */
  readonly copyOf: Option.Option<EventRef>
}

/** Whether the event takes its time: neither cancelled, declined nor shown as free. */
export const blocks = (entry: Entry): boolean =>
  !entry.cancelled && entry.rsvp !== "declined" && entry.showAs !== "free"

export class Event extends Schema.Class<Event>("Event")({
  id: EventId,
  calendar: CalendarId,
  title: Schema.String,
  start: Time.PragueLocal,
  end: Time.PragueLocal.annotate({ description: "For an all-day event, the midnight after its last day." }),
  allDay: Schema.Boolean,
  kind: Kind,
  showAs: ShowAs,
  rsvp: Rsvp,
  cancelled: Schema.Boolean,
  recurring: Schema.Boolean,
  location: Schema.NullOr(Schema.String),
  category: Schema.NullOr(Schema.String),
  notes: Schema.NullOr(Schema.String),
  attendees: Schema.Array(Attendee),
  copyOf: Schema.NullOr(EventId).annotate({ description: "The original a copy was written from." })
}) {}

export const eventOf = (entry: Entry): Event =>
  new Event({
    id: eventId(entry.ref),
    calendar: entry.ref.calendar,
    title: entry.title,
    start: Time.toPragueLocal(entry.span.start),
    end: Time.toPragueLocal(entry.span.end),
    allDay: entry.allDay,
    kind: entry.kind,
    showAs: entry.showAs,
    rsvp: entry.rsvp,
    cancelled: entry.cancelled,
    recurring: entry.recurring,
    location: Option.getOrNull(entry.location),
    category: Option.getOrNull(entry.category),
    notes: Option.getOrNull(entry.notes),
    attendees: entry.attendees,
    copyOf: Option.getOrNull(Option.map(entry.copyOf, eventId))
  })
