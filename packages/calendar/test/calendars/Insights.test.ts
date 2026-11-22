import { assert, describe, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Time from "@ras/kernel/Time"
import * as Calendar from "../../src/calendars/Calendar.ts"
import * as Insights from "../../src/calendars/Insights.ts"
import * as Event from "../../src/events/Event.ts"

const at = (iso: string) => DateTime.makeUnsafe(iso)

const own = Calendar.CalendarId.make(1)
const client = Calendar.CalendarId.make(2)

const entry = (title: string, start: string, end: string, more: Partial<Event.Entry> = {}): Event.Entry => ({
  ref: { calendar: own, date: Time.pragueDateOf(at(start)), id: `${title}-${start}` },
  title,
  span: { start: at(start), end: at(end) },
  allDay: false,
  kind: "plain",
  showAs: "busy",
  rsvp: "accepted",
  cancelled: false,
  recurring: false,
  location: Option.none(),
  category: Option.none(),
  notes: Option.none(),
  attendees: [],
  copyOf: Option.none(),
  ...more
})

const design = "0b6f6a3e-6f3c-4d8e-9a51-5d1c2f7e8a01"
const review = "7c2d9e14-3b8a-4f6e-8d27-1e9a0b4c6f02"

const block = (id: string, start: string, end: string, more: Partial<Event.Entry> = {}) =>
  entry("Work", start, end, { notes: Option.some(`Sketches\n${Event.blockMarker(id)}`), ...more })

const period = (kind: Insights.PeriodKind, date: string) => ({ kind, date: Time.PragueDate.make(date) })

/** Wednesday 13 January 2027, noon in Prague. */
const midweek = at("2027-01-13T11:00:00Z")
/** Long after every period the tests ask about. */
const later = at("2030-01-01T00:00:00Z")

describe("insights of a period", () => {
  it("counts zero for a period with no events", () => {
    const insights = Insights.report([], period("month", "2027-02-10"), [own], later)
    assert.strictEqual(insights.taken, 0)
    assert.strictEqual(insights.planned, 0)
    assert.deepStrictEqual(
      insights.parts.map((part) => [part.first, part.last, part.taken]),
      [
        ["2027-02-01", "2027-02-07", 0],
        ["2027-02-08", "2027-02-14", 0],
        ["2027-02-15", "2027-02-21", 0],
        ["2027-02-22", "2027-02-28", 0]
      ]
    )
  })

  it("splits a Monday-to-Sunday week into days, its time taken up to now and planned after it", () => {
    const insights = Insights.report(
      [
        entry("Standup", "2027-01-11T08:00:00Z", "2027-01-11T08:30:00Z"),
        entry("Review", "2027-01-13T10:30:00Z", "2027-01-13T12:00:00Z"),
        entry("Demo", "2027-01-15T13:00:00Z", "2027-01-15T14:00:00Z"),
        entry("Last week", "2027-01-08T08:00:00Z", "2027-01-08T09:00:00Z")
      ],
      period("week", "2027-01-14"),
      [own],
      midweek
    )
    assert.deepStrictEqual([insights.first, insights.last], ["2027-01-11", "2027-01-17"])
    assert.strictEqual(insights.taken, 60)
    assert.strictEqual(insights.planned, 120)
    assert.deepStrictEqual(
      insights.parts.map((part) => [part.first, part.taken, part.planned]),
      [
        ["2027-01-11", 30, 0],
        ["2027-01-12", 0, 0],
        ["2027-01-13", 30, 60],
        ["2027-01-14", 0, 0],
        ["2027-01-15", 0, 60],
        ["2027-01-16", 0, 0],
        ["2027-01-17", 0, 0]
      ]
    )
  })

  it("counts no all-day, free, declined or cancelled event, and shared time of overlapping events once", () => {
    const insights = Insights.report(
      [
        entry("Holiday", "2027-01-11T23:00:00Z", "2027-01-12T23:00:00Z", { allDay: true }),
        entry("Focus", "2027-01-12T08:00:00Z", "2027-01-12T09:00:00Z", { showAs: "free" }),
        entry("Sales call", "2027-01-12T09:00:00Z", "2027-01-12T10:00:00Z", { rsvp: "declined" }),
        entry("Offsite", "2027-01-12T10:00:00Z", "2027-01-12T11:00:00Z", { cancelled: true }),
        entry("Planning", "2027-01-12T12:00:00Z", "2027-01-12T14:00:00Z"),
        entry("Interview", "2027-01-12T13:00:00Z", "2027-01-12T15:00:00Z")
      ],
      period("week", "2027-01-12"),
      [own],
      later
    )
    assert.strictEqual(insights.taken, 180)
  })

  it("counts an event past midnight on each day, and only its part inside the period", () => {
    const events = [
      entry("Release", "2027-01-31T21:00:00Z", "2027-02-01T01:00:00Z"),
      entry("Night shift", "2027-01-26T22:00:00Z", "2027-01-27T02:00:00Z")
    ]
    const january = Insights.report(events, period("month", "2027-01-20"), [own], later)
    const february = Insights.report(events, period("month", "2027-02-20"), [own], later)
    assert.strictEqual(january.taken, 360)
    assert.strictEqual(february.taken, 120)
    const week = Insights.report(events, period("week", "2027-01-27"), [own], later)
    assert.deepStrictEqual(
      week.parts.filter((part) => part.taken > 0).map((part) => [part.first, part.taken]),
      [
        ["2027-01-26", 60],
        ["2027-01-27", 180],
        ["2027-01-31", 120]
      ]
    )
  })

  it("cuts a month's weeks at its edges and a quarter into months, the parts adding up to the total", () => {
    const events = [
      entry("Kickoff", "2027-03-01T08:00:00Z", "2027-03-01T10:00:00Z"),
      entry("Workshop", "2027-03-07T08:00:00Z", "2027-03-07T09:00:00Z"),
      entry("Retro", "2027-03-31T12:00:00Z", "2027-03-31T13:30:00Z"),
      entry("Audit", "2027-02-15T08:00:00Z", "2027-02-15T12:00:00Z"),
      entry("Q2", "2027-04-01T08:00:00Z", "2027-04-01T09:00:00Z")
    ]
    const march = Insights.report(events, period("month", "2027-03-15"), [own], later)
    assert.deepStrictEqual(
      march.parts.map((part) => [part.first, part.last, part.taken]),
      [
        ["2027-03-01", "2027-03-07", 180],
        ["2027-03-08", "2027-03-14", 0],
        ["2027-03-15", "2027-03-21", 0],
        ["2027-03-22", "2027-03-28", 0],
        ["2027-03-29", "2027-03-31", 90]
      ]
    )
    assert.strictEqual(march.taken, 270)
    const quarter = Insights.report(events, period("quarter", "2027-02-01"), [own], later)
    assert.deepStrictEqual([quarter.first, quarter.last], ["2027-01-01", "2027-03-31"])
    assert.deepStrictEqual(
      quarter.parts.map((part) => [part.first, part.last, part.taken]),
      [
        ["2027-01-01", "2027-01-31", 0],
        ["2027-02-01", "2027-02-28", 240],
        ["2027-03-01", "2027-03-31", 270]
      ]
    )
    assert.strictEqual(quarter.taken, 510)
  })

  it("counts by the Prague clock in a week and a month across a daylight-saving change", () => {
    const events = [
      // 22:00 Saturday to 04:00 Sunday Prague, the night the clocks go forward: five hours.
      entry("Migration", "2027-03-27T21:00:00Z", "2027-03-28T02:00:00Z"),
      // 23:00 Saturday to 03:00 Sunday Prague, the night the clocks go back: five hours.
      entry("Failover", "2027-10-30T21:00:00Z", "2027-10-31T02:00:00Z")
    ]
    const spring = Insights.report(events, period("week", "2027-03-24"), [own], later)
    assert.deepStrictEqual(
      spring.parts.slice(5).map((part) => [part.first, part.taken]),
      [
        ["2027-03-27", 120],
        ["2027-03-28", 180]
      ]
    )
    const october = Insights.report(events, period("month", "2027-10-01"), [own], later)
    assert.strictEqual(october.taken, 300)
    assert.deepStrictEqual(october.parts.map((part) => [part.first, part.last, part.taken]).at(-1), [
      "2027-10-25",
      "2027-10-31",
      300
    ])
    const autumn = Insights.report(events, period("week", "2027-10-31"), [own], later)
    assert.deepStrictEqual(
      autumn.parts.slice(5).map((part) => [part.first, part.taken]),
      [
        ["2027-10-30", 60],
        ["2027-10-31", 240]
      ]
    )
  })

  it("splits the taken time into work blocks by block and other events by title, overlaps going to the events", () => {
    const insights = Insights.report(
      [
        block(design, "2027-01-11T08:00:00Z", "2027-01-11T11:00:00Z"),
        block(design, "2027-01-12T08:00:00Z", "2027-01-12T09:00:00Z"),
        block(review, "2027-01-12T12:00:00Z", "2027-01-12T13:00:00Z"),
        entry("Standup", "2027-01-11T09:00:00Z", "2027-01-11T09:30:00Z"),
        entry("Standup", "2027-01-12T09:00:00Z", "2027-01-12T09:30:00Z"),
        entry("Steering", "2027-01-12T12:30:00Z", "2027-01-12T14:00:00Z")
      ],
      period("week", "2027-01-11"),
      [own],
      later
    )
    assert.strictEqual(insights.taken, 390)
    assert.deepStrictEqual(insights.workBlocks, {
      minutes: 240,
      blocks: [
        { block: design, minutes: 210 },
        { block: review, minutes: 30 }
      ]
    })
    assert.deepStrictEqual(insights.otherEvents, {
      minutes: 150,
      titles: [
        { title: "Standup", minutes: 60 },
        { title: "Steering", minutes: 90 }
      ]
    })
    assert.strictEqual(insights.workBlocks.minutes + insights.otherEvents.minutes, insights.taken)
  })

  it("gives the shared time of overlapping work blocks to the one that starts first, the blocks adding up", () => {
    const insights = Insights.report(
      [
        block(review, "2027-01-11T09:00:00Z", "2027-01-11T11:00:00Z"),
        block(design, "2027-01-11T08:00:00Z", "2027-01-11T10:00:00Z"),
        block(review, "2027-01-12T08:00:00Z", "2027-01-12T09:00:00Z"),
        block(design, "2027-01-12T08:00:00Z", "2027-01-12T09:00:00Z")
      ],
      period("week", "2027-01-11"),
      [own],
      later
    )
    assert.deepStrictEqual(insights.workBlocks, {
      minutes: 240,
      blocks: [
        { block: design, minutes: 120 },
        { block: review, minutes: 120 }
      ]
    })
  })

  it("gives each chosen calendar its subtotal, counting its own overlaps once, and leaves the others out", () => {
    const insights = Insights.report(
      [
        block(design, "2027-01-11T08:00:00Z", "2027-01-11T10:00:00Z"),
        entry("Sync", "2027-01-11T09:00:00Z", "2027-01-11T10:00:00Z", {
          ref: { calendar: client, date: Time.PragueDate.make("2027-01-11"), id: "sync" }
        }),
        entry("Sync prep", "2027-01-11T09:30:00Z", "2027-01-11T10:30:00Z", {
          ref: { calendar: client, date: Time.PragueDate.make("2027-01-11"), id: "prep" }
        }),
        entry("Planned call", "2027-01-15T09:00:00Z", "2027-01-15T10:00:00Z", {
          ref: { calendar: client, date: Time.PragueDate.make("2027-01-15"), id: "call" }
        }),
        entry("Gym", "2027-01-11T16:00:00Z", "2027-01-11T17:00:00Z", {
          ref: { calendar: Calendar.CalendarId.make(3), date: Time.PragueDate.make("2027-01-11"), id: "gym" }
        })
      ],
      period("week", "2027-01-11"),
      [own, client],
      midweek
    )
    assert.strictEqual(insights.taken, 150)
    assert.strictEqual(insights.planned, 60)
    assert.deepStrictEqual(insights.calendars, [
      { calendar: own, taken: 120, planned: 0 },
      { calendar: client, taken: 90, planned: 60 }
    ])
  })

  it("counts an event and its copy in another chosen calendar once", () => {
    const original = entry("Standup", "2027-01-11T09:00:00Z", "2027-01-11T09:30:00Z")
    const insights = Insights.report(
      [
        original,
        entry("Standup", "2027-01-11T09:00:00Z", "2027-01-11T09:30:00Z", {
          ref: { calendar: client, date: Time.PragueDate.make("2027-01-11"), id: "copy" },
          kind: "copy",
          copyOf: Option.some(original.ref)
        })
      ],
      period("week", "2027-01-11"),
      [own, client],
      later
    )
    assert.strictEqual(insights.taken, 30)
    assert.deepStrictEqual(insights.otherEvents.titles, [{ title: "Standup", minutes: 30 }])
  })

  it("counts a past unanswered invitation and lists it with a warning, a future one only as planned", () => {
    const insights = Insights.report(
      [
        entry("Budget", "2027-01-11T13:00:00Z", "2027-01-11T14:00:00Z", { kind: "invitation", rsvp: "needsAction" }),
        entry("Kickoff", "2027-01-12T08:00:00Z", "2027-01-12T08:30:00Z", { kind: "invitation", rsvp: "none" }),
        entry("Roadmap", "2027-01-12T09:00:00Z", "2027-01-12T10:00:00Z", { kind: "invitation", rsvp: "tentative" }),
        entry("Board", "2027-01-14T09:00:00Z", "2027-01-14T10:00:00Z", { kind: "invitation", rsvp: "needsAction" })
      ],
      period("week", "2027-01-11"),
      [own],
      midweek
    )
    assert.strictEqual(insights.taken, 150)
    assert.strictEqual(insights.planned, 60)
    assert.deepStrictEqual(
      insights.unanswered.map((event) => [event.title, event.start, event.end, event.minutes]),
      [
        ["Budget", "2027-01-11T14:00", "2027-01-11T15:00", 60],
        ["Kickoff", "2027-01-12T09:00", "2027-01-12T09:30", 30]
      ]
    )
  })

  it("leaves a past draft out of the taken time as unconfirmed time, and counts a future one as planned", () => {
    const draft = { id: Event.DraftId.make("4f1c2b7a-9d3e-4a6b-8c5f-2e7d1a9b0c03"), refusal: Option.none() }
    const insights = Insights.report(
      [
        block(design, "2027-01-11T08:00:00Z", "2027-01-11T10:00:00Z", { draft }),
        block(review, "2027-01-11T12:00:00Z", "2027-01-11T13:00:00Z"),
        entry("Call notes", "2027-01-12T15:00:00Z", "2027-01-12T15:45:00Z", { draft, rsvp: "none" }),
        block(design, "2027-01-14T08:00:00Z", "2027-01-14T10:00:00Z", { draft })
      ],
      period("week", "2027-01-11"),
      [own],
      midweek
    )
    assert.strictEqual(insights.taken, 60)
    assert.strictEqual(insights.planned, 120)
    assert.deepStrictEqual(insights.workBlocks.blocks, [{ block: review, minutes: 60 }])
    assert.strictEqual(insights.unconfirmed.minutes, 165)
    assert.deepStrictEqual(
      insights.unconfirmed.drafts.map((found) => [found.title, found.block, found.start, found.minutes]),
      [
        ["Work", design, "2027-01-11T09:00", 120],
        ["Call notes", null, "2027-01-12T16:00", 45]
      ]
    )
  })
})
