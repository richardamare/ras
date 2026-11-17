import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Id from "@ras/kernel/Id"
import * as Time from "@ras/kernel/Time"
import * as Calendar from "../calendars/Calendar.ts"
import * as Span from "../calendars/Span.ts"

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
  readonly calendar: Calendar.CalendarId
  readonly date: Time.PragueDate
  readonly id: string
}

export const eventId = (ref: EventRef): EventId =>
  EventId.make(`${ref.calendar}.${ref.date.replaceAll("-", "")}.${ref.id}`)

export const eventRef = (id: EventId): EventRef => {
  const [calendar, day] = id.split(".", 2) as [string, string]
  return {
    calendar: Calendar.CalendarId.make(Number(calendar)),
    date: Time.PragueDate.make(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`),
    id: id.slice(calendar.length + day.length + 2)
  }
}

export class Attendee extends Schema.Class<Attendee>("Attendee")({
  name: Schema.NullOr(Schema.String),
  email: Schema.NullOr(Schema.String),
  rsvp: Rsvp,
  organizer: Schema.Boolean,
  optional: Schema.Boolean
}) {}

/** An event as a source holds it, its span in instants; an all-day event spans Prague midnight to Prague midnight. */
export interface Entry {
  readonly ref: EventRef
  readonly title: string
  readonly span: Span.Span
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
  /** For an event drafted in ras and not confirmed yet: the draft, and why the calendar refused it, if it did. */
  readonly draft?: { readonly id: DraftId; readonly refusal: Option.Option<string> }
}

export const DraftId = Id.Uuid.pipe(Schema.brand("DraftId"))
export type DraftId = typeof DraftId.Type

/** The id a draft's event carries in its calendar, which no calendar's own id can be. */
export const draftEventId = (id: DraftId) => `draft-${id}`

/** The line a work block's event carries in its notes, which ties the event to its block. */
export const blockMarker = (block: string) => `ras-block:${block}`

const markerPattern = /ras-block:([0-9a-f-]{36})/

/** The work block an event belongs to, read from the marker in its notes. */
export const blockOf = (entry: Entry): Option.Option<string> =>
  Option.flatMap(entry.notes, (notes) => Option.fromNullishOr(markerPattern.exec(notes)?.[1]))

/** The notes as the owner wrote them, without a block's marker. */
const shownNotes = (notes: Option.Option<string>) =>
  Option.filter(
    Option.map(notes, (text) => text.replace(markerPattern, "").trim()),
    (text) => text.length > 0
  )

/** Whether the event takes its time: neither cancelled, declined nor shown as free. */
export const blocks = (entry: Entry): boolean =>
  !entry.cancelled && entry.rsvp !== "declined" && entry.showAs !== "free"

export class Event extends Schema.Class<Event>("Event")({
  id: EventId,
  calendar: Calendar.CalendarId,
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
  copyOf: Schema.NullOr(EventId).annotate({ description: "The original a copy was written from." }),
  block: Schema.NullOr(Schema.String).annotate({ description: "The work block whose event this is." }),
  draft: Schema.NullOr(Schema.Struct({ refusal: Schema.NullOr(Schema.String) })).annotate({
    description: "Set while the event is a draft in ras, with why its calendar refused it when it was confirmed."
  })
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
    notes: Option.getOrNull(shownNotes(entry.notes)),
    attendees: entry.attendees,
    copyOf: Option.getOrNull(Option.map(entry.copyOf, eventId)),
    block: Option.getOrNull(blockOf(entry)),
    draft: entry.draft === undefined ? null : { refusal: Option.getOrNull(entry.draft.refusal) }
  })
