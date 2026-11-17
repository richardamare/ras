import { assert, describe, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Time from "@ras/kernel/Time"
import * as Domain from "../src/Domain.ts"
import * as Rules from "../src/Rules.ts"

const calendar = (role: Domain.Role, enabled = true) =>
  new Domain.Calendar({ id: Domain.CalendarId.make(1), name: role, color: "#000000", role, enabled })

const event = (kind: Domain.Kind): Domain.Entry => ({
  ref: { calendar: Domain.CalendarId.make(1), date: Time.PragueDate.make("2027-01-15"), id: "e" },
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
  attendees: [new Domain.Attendee({ name: "Ada", email: null, rsvp: "accepted", organizer: true, optional: false })],
  copyOf: Option.none()
})

const code = (write: Rules.Write) => Option.getOrNull(Option.map(Rules.refusal(write), (refused) => refused.code))

describe("the calendar rules", () => {
  it("creates, changes and cancels a plain event in a personal calendar", () => {
    assert.isNull(code({ _tag: "Create", calendar: calendar("personal") }))
    assert.isNull(code({ _tag: "Change", calendar: calendar("personal"), event: event("plain") }))
    assert.isNull(code({ _tag: "Cancel", calendar: calendar("personal"), event: event("plain") }))
  })

  it("replies to an invitation in a personal or a work calendar", () => {
    assert.isNull(code({ _tag: "Reply", calendar: calendar("personal"), event: event("invitation") }))
    assert.isNull(code({ _tag: "Reply", calendar: calendar("work"), event: event("invitation") }))
  })

  it("refuses any write to a calendar turned off", () => {
    assert.strictEqual(code({ _tag: "Create", calendar: calendar("personal", false) }), "calendar.calendar.off")
    assert.strictEqual(
      code({ _tag: "Change", calendar: calendar("personal", false), event: event("plain") }),
      "calendar.calendar.off"
    )
    assert.strictEqual(
      code({ _tag: "Reply", calendar: calendar("work", false), event: event("invitation") }),
      "calendar.calendar.off"
    )
  })

  it("refuses an event added to the work calendar, telling to create it in work Outlook", () => {
    const refused = Option.getOrThrow(Rules.refusal({ _tag: "Create", calendar: calendar("work") }))
    assert.strictEqual(refused.code, "calendar.calendar.work")
    assert.strictEqual(refused.instead, "Create it in work Outlook.")
  })

  it("refuses an event added to a copy calendar", () => {
    assert.strictEqual(code({ _tag: "Create", calendar: calendar("copy") }), "calendar.calendar.copy")
  })

  it("refuses every write to an unmarked calendar", () => {
    assert.strictEqual(code({ _tag: "Create", calendar: calendar("unmarked") }), "calendar.calendar.unmarked")
    assert.strictEqual(
      code({ _tag: "Change", calendar: calendar("unmarked"), event: event("plain") }),
      "calendar.calendar.unmarked"
    )
    assert.strictEqual(
      code({ _tag: "Reply", calendar: calendar("unmarked"), event: event("invitation") }),
      "calendar.calendar.unmarked"
    )
  })

  it("refuses a change to a work event, telling to change it in work Outlook", () => {
    const refused = Option.getOrThrow(
      Rules.refusal({ _tag: "Change", calendar: calendar("work"), event: event("plain") })
    )
    assert.strictEqual(refused.code, "calendar.event.work")
    assert.strictEqual(refused.instead, "Change it in work Outlook.")
    assert.strictEqual(
      code({ _tag: "Cancel", calendar: calendar("work"), event: event("invitation") }),
      "calendar.event.work"
    )
  })

  it("refuses any write to a copy, in a copy calendar or written into another", () => {
    assert.strictEqual(
      code({ _tag: "Change", calendar: calendar("copy"), event: event("plain") }),
      "calendar.event.copy"
    )
    assert.strictEqual(
      code({ _tag: "Cancel", calendar: calendar("personal"), event: event("copy") }),
      "calendar.event.copy"
    )
    assert.strictEqual(
      code({ _tag: "Reply", calendar: calendar("personal"), event: event("copy") }),
      "calendar.event.copy"
    )
  })

  it("refuses a change to Reclaim's own event", () => {
    assert.strictEqual(
      code({ _tag: "Change", calendar: calendar("personal"), event: event("reclaim") }),
      "calendar.event.reclaim"
    )
  })

  it("refuses a change to an invitation, naming its organizer", () => {
    const refused = Option.getOrThrow(
      Rules.refusal({ _tag: "Cancel", calendar: calendar("personal"), event: event("invitation") })
    )
    assert.strictEqual(refused.code, "calendar.event.invitation")
    assert.include(refused.reason, "from Ada")
    assert.strictEqual(refused.instead, "Reply to it instead.")
  })

  it("refuses a reply to an event that is not an invitation", () => {
    assert.strictEqual(
      code({ _tag: "Reply", calendar: calendar("personal"), event: event("plain") }),
      "calendar.event.not-invitation"
    )
  })
})
