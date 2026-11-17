import * as Option from "effect/Option"
import * as Errors from "@ras/kernel/Errors"
import type * as Domain from "./Domain.ts"

/** One write to a calendar, as the rules judge it. */
export type Write =
  | { readonly _tag: "Create"; readonly calendar: Domain.Calendar }
  | { readonly _tag: "Change"; readonly calendar: Domain.Calendar; readonly event: Domain.Entry }
  | { readonly _tag: "Cancel"; readonly calendar: Domain.Calendar; readonly event: Domain.Entry }
  | { readonly _tag: "Reply"; readonly calendar: Domain.Calendar; readonly event: Domain.Entry }

const refused = (code: string, reason: string, instead: string) =>
  Option.some(new Errors.Refused({ code: `calendar.${code}`, reason, instead }))

const turnedOff = (calendar: Domain.Calendar) =>
  refused(
    "calendar.off",
    `"${calendar.name}" is turned off in ras, so ras neither shows nor writes it.`,
    "Turn it on under Settings, Calendars."
  )

const unmarked = (calendar: Domain.Calendar) =>
  refused(
    "calendar.unmarked",
    `"${calendar.name}" has no role in ras yet, so ras writes nothing to it.`,
    "Mark it personal, work or copy under Settings, Calendars."
  )

const copied = (event: Domain.Entry) =>
  refused(
    "event.copy",
    `"${event.title}" is a copy written by Calendar Sync, and the next sync would undo a change to it.`,
    "Change the original instead."
  )

const isCopy = (calendar: Domain.Calendar, event: Domain.Entry) => calendar.role === "copy" || event.kind === "copy"

const organizer = (event: Domain.Entry) =>
  Option.getOrElse(
    Option.flatMap(Option.fromUndefinedOr(event.attendees.find((attendee) => attendee.organizer)), (attendee) =>
      Option.fromNullOr(attendee.name ?? attendee.email)
    ),
    () => "someone else"
  )

const create = (calendar: Domain.Calendar): Option.Option<Errors.Refused> => {
  if (!calendar.enabled) return turnedOff(calendar)
  switch (calendar.role) {
    case "personal":
      return Option.none()
    case "work":
      return refused(
        "calendar.work",
        `"${calendar.name}" is the work calendar, which ras reaches only through Reclaim and cannot add events to.`,
        "Create it in work Outlook."
      )
    case "copy":
      return refused(
        "calendar.copy",
        `"${calendar.name}" is a copy written by Calendar Sync, so an event added there would not reach the calendar it copies.`,
        "Add it to a personal calendar."
      )
    case "unmarked":
      return unmarked(calendar)
  }
}

const edit = (calendar: Domain.Calendar, event: Domain.Entry, verb: string): Option.Option<Errors.Refused> => {
  if (!calendar.enabled) return turnedOff(calendar)
  if (isCopy(calendar, event)) return copied(event)
  if (event.kind === "reclaim")
    return refused(
      "event.reclaim",
      `"${event.title}" is Reclaim's own event, a task block or habit that Reclaim moves itself.`,
      "Change the task or the habit in Reclaim instead."
    )
  switch (calendar.role) {
    case "work":
      return refused("event.work", `"${event.title}" is in the work calendar.`, "Change it in work Outlook.")
    case "personal":
      return event.kind === "invitation"
        ? refused(
            "event.invitation",
            `"${event.title}" is an invitation from ${organizer(event)}, and only its organizer can ${verb} it.`,
            "Reply to it instead."
          )
        : Option.none()
    default:
      return unmarked(calendar)
  }
}

const reply = (calendar: Domain.Calendar, event: Domain.Entry): Option.Option<Errors.Refused> => {
  if (!calendar.enabled) return turnedOff(calendar)
  if (isCopy(calendar, event)) return copied(event)
  if (calendar.role === "unmarked") return unmarked(calendar)
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
 * in a personal calendar; an invitation takes only a reply; copies and Reclaim's own events take nothing.
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
