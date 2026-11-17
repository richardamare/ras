import { assert, describe, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Time from "@ras/kernel/Time"
import * as Busy from "../../src/calendars/Busy.ts"
import * as Domain from "../../src/Domain.ts"
import * as WorkHours from "../../src/calendars/WorkHours.ts"

const at = (iso: string) => DateTime.makeUnsafe(iso)

const entry = (title: string, start: string, end: string, more: Partial<Domain.Entry> = {}): Domain.Entry => ({
  ref: { calendar: Domain.CalendarId.make(1), date: Time.pragueDateOf(at(start)), id: title },
  title,
  span: { start: at(start), end: at(end) },
  allDay: false,
  kind: "plain",
  showAs: "busy",
  rsvp: "accepted",
  cancelled: false,
  recurring: false,
  location: Option.none(),
  category: Option.some("WORK"),
  notes: Option.none(),
  attendees: [],
  copyOf: Option.none(),
  ...more
})

const personal = new Domain.Calendar({
  id: Domain.CalendarId.make(1),
  name: "Personal",
  color: "#000000",
  writable: true,
  enabled: true
})

/** 08:00 to 12:00 Prague on 15 January 2027. */
const morning = { start: at("2027-01-15T07:00:00Z"), end: at("2027-01-15T11:00:00Z") }

describe("free time", () => {
  it("lists the gaps the blocking events leave, merging events that overlap or touch", () => {
    const slots = Busy.freeTime(
      [
        entry("a", "2027-01-15T07:30:00Z", "2027-01-15T08:00:00Z"),
        entry("b", "2027-01-15T07:45:00Z", "2027-01-15T08:30:00Z"),
        entry("c", "2027-01-15T08:30:00Z", "2027-01-15T09:00:00Z"),
        entry("d", "2027-01-15T09:10:00Z", "2027-01-15T09:30:00Z")
      ],
      morning,
      15
    )
    assert.deepStrictEqual(
      slots.map((slot) => [slot.start, slot.end, slot.minutes]),
      [
        ["2027-01-15T08:00", "2027-01-15T08:30", 30],
        ["2027-01-15T10:30", "2027-01-15T12:00", 90]
      ]
    )
  })

  it("leaves the time of a free, declined or cancelled event free", () => {
    const slots = Busy.freeTime(
      [
        entry("free", "2027-01-15T07:00:00Z", "2027-01-15T08:00:00Z", { showAs: "free" }),
        entry("declined", "2027-01-15T08:00:00Z", "2027-01-15T09:00:00Z", { rsvp: "declined" }),
        entry("cancelled", "2027-01-15T09:00:00Z", "2027-01-15T10:00:00Z", { cancelled: true })
      ],
      morning,
      30
    )
    assert.deepStrictEqual(
      slots.map((slot) => slot.minutes),
      [240]
    )
  })
})

describe("conflicts", () => {
  it("pairs overlapping events with the fixes the rules allow, but never a copy with its original", () => {
    const original = entry("Standup", "2027-01-15T08:00:00Z", "2027-01-15T08:30:00Z")
    const copy = entry("Standup copy", "2027-01-15T08:00:00Z", "2027-01-15T08:30:00Z", {
      kind: "copy",
      copyOf: Option.some(original.ref)
    })
    const invitation = entry("Review", "2027-01-15T08:15:00Z", "2027-01-15T09:00:00Z", { kind: "invitation" })
    const found = Busy.conflicts([original, copy, invitation], [personal], morning)
    assert.deepStrictEqual(
      found.map((conflict) => [conflict.first.title, conflict.second.title, conflict.from, conflict.to]),
      [
        ["Standup", "Review", "2027-01-15T09:15", "2027-01-15T09:30"],
        ["Standup copy", "Review", "2027-01-15T09:15", "2027-01-15T09:30"]
      ]
    )
    assert.deepStrictEqual(found[0]!.firstFixes, ["Move it with change_event.", "Cancel it with cancel_event."])
    assert.deepStrictEqual(found[0]!.secondFixes, ["Decline it with reply_to_event."])
    assert.deepStrictEqual(found[1]!.firstFixes, [
      '"Standup copy" is a copy written by Calendar Sync, and the next sync would undo a change to it. Change the original instead.'
    ])
  })
})

describe("work hours", () => {
  it("counts overlapping time once, by category and per Prague day, splitting a stretch past midnight", () => {
    const report = WorkHours.report(
      [
        entry("a", "2027-01-15T08:00:00Z", "2027-01-15T10:00:00Z"),
        entry("b", "2027-01-15T09:00:00Z", "2027-01-15T11:00:00Z"),
        entry("late", "2027-01-15T22:00:00Z", "2027-01-16T00:00:00Z", { category: Option.none() }),
        entry("all day", "2027-01-17T23:00:00Z", "2027-01-18T23:00:00Z", { allDay: true }),
        entry("free", "2027-01-18T08:00:00Z", "2027-01-18T09:00:00Z", { showAs: "free" })
      ],
      Domain.Month.make("2027-01"),
      []
    )
    assert.strictEqual(report.minutes, 300)
    assert.deepStrictEqual(report.categories, [
      { category: "No category", minutes: 120, events: 1 },
      { category: "WORK", minutes: 180, events: 2 }
    ])
    assert.deepStrictEqual(
      report.days.map((day) => [day.date, day.minutes]),
      [
        ["2027-01-15", 240],
        ["2027-01-16", 60]
      ]
    )
  })

  it("counts only the categories asked for, and keeps to the month across a daylight-saving change", () => {
    const report = WorkHours.report(
      [
        entry("in March", "2027-03-31T20:00:00Z", "2027-03-31T23:00:00Z"),
        entry("school", "2027-03-30T08:00:00Z", "2027-03-30T09:00:00Z", { category: Option.some("SCHOOL") })
      ],
      Domain.Month.make("2027-03"),
      ["work"]
    )
    assert.strictEqual(report.minutes, 120)
    assert.deepStrictEqual(
      report.days.map((day) => day.date),
      ["2027-03-31"]
    )
  })
})
