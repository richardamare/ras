import * as Option from "effect/Option"
import * as Errors from "@ras/kernel/Errors"
import * as Calendar from "../calendars/Calendar.ts"
import * as Event from "./Event.ts"

/** One write to a calendar, as the rules judge it. */
export type Write =
  | { readonly _tag: "Create"; readonly calendar: Calendar.Calendar }
  | { readonly _tag: "Change"; readonly calendar: Calendar.Calendar; readonly event: Event.Entry }
  | { readonly _tag: "Cancel"; readonly calendar: Calendar.Calendar; readonly event: Event.Entry }
  | { readonly _tag: "Reply"; readonly calendar: Calendar.Calendar; readonly event: Event.Entry }

const refused = (code: string, reason: string, instead: string) =>
  Option.some(new Errors.Refused({ code: `calendar.${code}`, reason, instead }))

const turnedOff = (calendar: Calendar.Calendar) =>
  refused(
    "calendar.off",
    `"${calendar.name}" is turned off in ras, so ras neither shows nor writes it.`,
    "Turn it on under Settings, Calendars."
  )

const organizer = (event: Event.Entry) =>
  Option.getOrElse(
    Option.flatMap(Option.fromUndefinedOr(event.attendees.find((attendee) => attendee.organizer)), (attendee) =>
      Option.fromNullOr(attendee.name ?? attendee.email)
    ),
    () => "someone else"
  )

const create = (calendar: Calendar.Calendar): Option.Option<Errors.Refused> => {
  if (!calendar.enabled) return turnedOff(calendar)
  return calendar.writable
    ? Option.none()
    : refused(
        "calendar.readonly",
        `"${calendar.name}" is not in an Outlook or Google account connected to ras, so ras cannot add events to it.`,
        "Add it to a calendar of a connected account, or create it in that calendar's own app."
      )
}

const edit = (calendar: Calendar.Calendar, event: Event.Entry, verb: string): Option.Option<Errors.Refused> => {
  if (!calendar.enabled) return turnedOff(calendar)
  if (event.kind === "copy")
    return refused(
      "event.copy",
      `"${event.title}" is a copy written by Calendar Sync, and the next sync would undo a change to it.`,
      "Change the original instead."
    )
  if (Option.isSome(Event.blockOf(event)))
    return refused(
      "event.block",
      `"${event.title}" is a work block's event, which changes with its block.`,
      "Move or remove the block with move_work or remove_work."
    )
  if (event.kind === "reclaim")
    return refused(
      "event.reclaim",
      `"${event.title}" is Reclaim's own event, a task block or habit that Reclaim moves itself.`,
      "Change the task or the habit in Reclaim instead."
    )
  if (!calendar.writable)
    return refused(
      "event.readonly",
      `"${event.title}" is in "${calendar.name}", which is not in an Outlook or Google account connected to ras.`,
      "Change it in that calendar's own app."
    )
  if (event.kind === "invitation")
    return refused(
      "event.invitation",
      `"${event.title}" is an invitation from ${organizer(event)}, and only its organizer can ${verb} it.`,
      "Reply to it instead."
    )
  return Option.none()
}

const reply = (calendar: Calendar.Calendar, event: Event.Entry): Option.Option<Errors.Refused> => {
  if (!calendar.enabled) return turnedOff(calendar)
  return event.kind === "invitation"
    ? Option.none()
    : refused(
        "event.not-invitation",
        `"${event.title}" is not an invitation, so there is nothing to reply to.`,
        "Change or cancel it instead."
      )
}

/**
 * Why the calendar rules refuse `write`, or none when they allow it. Plain events are created, changed and cancelled only
 * in a calendar of a connected Outlook or Google account; an invitation takes only a reply, in any calendar; copies and Reclaim's
 * own events take nothing.
 */
export const refusal = (write: Write): Option.Option<Errors.Refused> => {
  switch (write._tag) {
    case "Create":
      return create(write.calendar)
    case "Change":
      return edit(write.calendar, write.event, "change")
    case "Cancel":
      return edit(write.calendar, write.event, "cancel")
    case "Reply":
      return reply(write.calendar, write.event)
  }
}
