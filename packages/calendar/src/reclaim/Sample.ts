import * as Arr from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Time from "@ras/kernel/Time"
import * as Calendar from "../calendars/Calendar.ts"
import * as Event from "../events/Event.ts"
import * as Reclaim from "./Reclaim.ts"

export const personal = Calendar.CalendarId.make(101)
export const work = Calendar.CalendarId.make(201)
export const workCopy = Calendar.CalendarId.make(102)

const calendars: ReadonlyArray<Reclaim.SourceCalendar> = [
  {
    id: personal,
    name: "Personal",
    color: "#f7630c",
    account: 1,
    email: "owner@example.com",
    providerId: Option.some("sample-personal")
  },
  {
    id: workCopy,
    name: "Work (copy)",
    color: "#b146c2",
    account: 1,
    email: "owner@example.com",
    providerId: Option.some("sample-copy")
  },
  {
    id: work,
    name: "Work",
    color: "#00cc6a",
    account: 2,
    email: "owner@work.example.com",
    providerId: Option.some("sample-work")
  }
]

const owner = new Event.Attendee({
  name: "Owner",
  email: "owner@example.com",
  rsvp: "accepted",
  organizer: true,
  optional: false
})

interface Planned {
  readonly calendar: Calendar.CalendarId
  readonly id: string
  readonly title: string
  /** Days after the first day of the sample, and the Prague clocks it runs between; none for an all-day event. */
  readonly day: number
  readonly clock: Option.Option<readonly [string, string]>
  readonly kind?: Event.Kind
  readonly showAs?: Event.ShowAs
  readonly rsvp?: Event.Rsvp
  readonly category?: string
  readonly copyOf?: { readonly calendar: Calendar.CalendarId; readonly id: string }
}

const timed = (start: string, end: string) => Option.some([start, end] as const)

/** An invented fortnight: standups at work with their copies, a dentist, a weekly gym, a habit Reclaim placed, a clash and a holiday. */
const plan: ReadonlyArray<Planned> = [
  ...Arr.flatMap(Arr.range(0, 13), (day): ReadonlyArray<Planned> => [
    { calendar: work, id: `standup-${day}`, title: "Standup", day, clock: timed("09:00", "09:15"), category: "WORK" },
    {
      calendar: workCopy,
      id: `standup-copy-${day}`,
      title: "Standup",
      day,
      clock: timed("09:00", "09:15"),
      kind: "copy",
      copyOf: { calendar: work, id: `standup-${day}` }
    },
    { calendar: personal, id: `lunch-${day}`, title: "Lunch", day, clock: timed("12:00", "13:00"), kind: "reclaim" }
  ]),
  { calendar: personal, id: "dentist", title: "Dentist", day: 2, clock: timed("14:00", "15:00") },
  { calendar: personal, id: "gym", title: "Gym", day: 1, clock: timed("18:00", "19:00") },
  { calendar: personal, id: "gym", title: "Gym", day: 3, clock: timed("18:00", "19:00") },
  {
    calendar: work,
    id: "review",
    title: "Quarterly review",
    day: 2,
    clock: timed("14:30", "16:00"),
    kind: "invitation",
    rsvp: "needsAction",
    category: "WORK"
  },
  { calendar: personal, id: "holiday", title: "Holiday", day: 5, clock: Option.none(), showAs: "free" }
]

/** Reclaim with invented calendars and events around `today`, for tests, the console and the connector without accounts. */
export const make = (today: Time.PragueDate): Reclaim.Reclaim["Service"] => {
  const entries = Arr.map(plan, (planned): Event.Entry => {
    const date = Time.addDays(today, planned.day)
    const at = (clock: string) => Effect.runSync(Time.toInstant(Time.PragueLocal.make(`${date}T${clock}`)))
    const span = Option.match(planned.clock, {
      onNone: () => ({ start: Time.pragueMidnight(date), end: Time.pragueMidnight(Time.addDays(date, 1)) }),
      onSome: ([start, end]) => ({ start: at(start), end: at(end) })
    })
    return {
      ref: { calendar: planned.calendar, date, id: planned.id },
      title: planned.title,
      span,
      allDay: Option.isNone(planned.clock),
      kind: planned.kind ?? "plain",
      showAs: planned.showAs ?? "busy",
      rsvp: planned.rsvp ?? "accepted",
      cancelled: false,
      recurring: ["standup", "lunch", "gym"].some((series) => planned.id.startsWith(series)),
      location: Option.none(),
      category: Option.fromUndefinedOr(planned.category),
      notes: Option.none(),
      attendees: planned.kind === "invitation" ? [owner] : [],
      copyOf: Option.map(Option.fromUndefinedOr(planned.copyOf), (original) => ({ ...original, date }))
    }
  })
  return Reclaim.Reclaim.of({
    calendars: Effect.succeed(calendars),
    providerId: (_, event) => Effect.succeed(`graph-${event}`),
    reply: () => Effect.void,
    events: (first, end) => {
      const from = Time.pragueMidnight(first)
      const to = Time.pragueMidnight(end)
      return Effect.succeed(
        Arr.filter(
          entries,
          (entry) => DateTime.isLessThan(entry.span.start, to) && DateTime.isGreaterThan(entry.span.end, from)
        )
      )
    }
  })
}

export const layer = Layer.effect(
  Reclaim.Reclaim,
  Effect.map(DateTime.now, (now) => make(Time.pragueDateOf(now)))
)
