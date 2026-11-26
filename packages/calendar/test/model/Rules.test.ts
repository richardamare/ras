import { assert, describe, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Time from "@ras/kernel/Time"
import * as Calendar from "../../src/model/Calendar.ts"
import * as Event from "../../src/model/Event.ts"
import * as Rules from "../../src/model/Rules.ts"

const calendar = (writable: boolean, enabled = true) =>
  new Calendar.Calendar({ id: Calendar.CalendarId.make(1), name: "Calendar", color: "#000000", writable, enabled })

const outlook = calendar(true)
const other = calendar(false)

const event = (kind: Event.Kind): Event.Entry => ({
  ref: { calendar: Calendar.CalendarId.make(1), date: Time.PragueDate.make("2027-01-15"), id: "e" },
  title: "Meeting",
  span: { start: DateTime.makeUnsafe("2027-01-15T08:00:00Z"), end: DateTime.makeUnsafe("2027-01-15T09:00:00Z") },
  allDay: false,
  kind,
  showAs: "busy",
  rsvp: "accepted",
  cancelled: false,
  recurring: false,
  location: Option.none(),
  category: Option.none(),
  notes: Option.none(),
  attendees: [new Event.Attendee({ name: "Ada", email: null, rsvp: "accepted", organizer: true, optional: false })],
  copyOf: Option.none()
})

const code = (write: Rules.Write) => Option.getOrNull(Option.map(Rules.refusal(write), (refused) => refused.code))

describe("the calendar rules", () => {
  it("creates, changes and cancels a plain event in a calendar of the connected account", () => {
    assert.isNull(code({ _tag: "Create", calendar: outlook }))
    assert.isNull(code({ _tag: "Change", calendar: outlook, event: event("plain") }))
    assert.isNull(code({ _tag: "Cancel", calendar: outlook, event: event("plain") }))
  })

  it("replies to an invitation in any calendar", () => {
    assert.isNull(code({ _tag: "Reply", calendar: outlook, event: event("invitation") }))
    assert.isNull(code({ _tag: "Reply", calendar: other, event: event("invitation") }))
  })

  it("refuses any write to a calendar turned off", () => {
    assert.strictEqual(code({ _tag: "Create", calendar: calendar(true, false) }), "calendar.calendar.off")
    assert.strictEqual(
      code({ _tag: "Change", calendar: calendar(true, false), event: event("plain") }),
      "calendar.calendar.off"
    )
    assert.strictEqual(
      code({ _tag: "Reply", calendar: calendar(false, false), event: event("invitation") }),
      "calendar.calendar.off"
    )
  })

  it("refuses an event added to a calendar of another account", () => {
    const refused = Option.getOrThrow(Rules.refusal({ _tag: "Create", calendar: other }))
    assert.strictEqual(refused.code, "calendar.calendar.readonly")
    assert.include(refused.reason, "not in an Outlook or Google account connected to ras")
  })

  it("refuses a change to an event of another account, telling to change it in its own app", () => {
    const refused = Option.getOrThrow(Rules.refusal({ _tag: "Change", calendar: other, event: event("plain") }))
    assert.strictEqual(refused.code, "calendar.event.readonly")
    assert.strictEqual(refused.instead, "Change it in that calendar's own app.")
    assert.strictEqual(code({ _tag: "Cancel", calendar: other, event: event("invitation") }), "calendar.event.readonly")
  })

  it("refuses a change or a cancel of a copy written by Calendar Sync", () => {
    assert.strictEqual(code({ _tag: "Change", calendar: outlook, event: event("copy") }), "calendar.event.copy")
    assert.strictEqual(code({ _tag: "Cancel", calendar: outlook, event: event("copy") }), "calendar.event.copy")
    assert.strictEqual(
      code({ _tag: "Reply", calendar: outlook, event: event("copy") }),
      "calendar.event.not-invitation"
    )
  })

  it("refuses a change to Reclaim's own event", () => {
    assert.strictEqual(code({ _tag: "Change", calendar: outlook, event: event("reclaim") }), "calendar.event.reclaim")
  })

  it("refuses a change to an invitation, naming its organizer", () => {
    const refused = Option.getOrThrow(Rules.refusal({ _tag: "Cancel", calendar: outlook, event: event("invitation") }))
    assert.strictEqual(refused.code, "calendar.event.invitation")
    assert.include(refused.reason, "from Ada")
    assert.strictEqual(refused.instead, "Reply to it instead.")
  })

  it("refuses a reply to an event that is not an invitation", () => {
    assert.strictEqual(
      code({ _tag: "Reply", calendar: outlook, event: event("plain") }),
      "calendar.event.not-invitation"
    )
  })

  it("refuses a change to a work block's event, sending it to the block", () => {
    const block = { ...event("plain"), notes: Option.some("ras-block:0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b") }
    const refused = Option.getOrThrow(Rules.refusal({ _tag: "Change", calendar: outlook, event: block }))
    assert.strictEqual(refused.code, "calendar.event.block")
    assert.strictEqual(code({ _tag: "Cancel", calendar: outlook, event: block }), "calendar.event.block")
  })
})
