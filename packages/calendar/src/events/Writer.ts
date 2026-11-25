import type * as Effect from "effect/Effect"
import type * as Errors from "@ras/kernel/Errors"
import type * as Time from "@ras/kernel/Time"
import type * as Reclaim from "../reclaim/Reclaim.ts"
import type * as Event from "./Event.ts"
import type * as Recurrence from "./Recurrence.ts"

/** When an event happens, in Prague local time: a start and an end, or whole days from the first to the last. */
export type When =
  | { readonly _tag: "Timed"; readonly start: Time.PragueLocal; readonly end: Time.PragueLocal }
  | { readonly _tag: "AllDay"; readonly first: Time.PragueDate; readonly last: Time.PragueDate }

/** What a write gives an event; a change leaves every field it omits as it is. */
export interface Write {
  readonly title?: string | undefined
  readonly notes?: string | undefined
  readonly location?: string | undefined
  readonly showAs?: Event.ShowAs | undefined
  readonly when?: When | undefined
}

export interface NewEvent extends Write {
  readonly title: string
  readonly when: When
  readonly recurrence?: Recurrence.Recurrence | undefined
  /** The same key on a retried create writes the event once. */
  readonly key: string
}

/** An event a change or a cancel reaches: one read from Reclaim, or one ras placed by the id its create returned. */
export type Target =
  | { readonly _tag: "Read"; readonly entry: Event.Entry }
  | { readonly _tag: "Placed"; readonly id: string }

/** Plain events in the calendars of one account connected to ras, written through that account's provider. */
export interface Writer {
  readonly create: (
    calendar: Reclaim.SourceCalendar,
    event: NewEvent
  ) => Effect.Effect<{ readonly id: string; readonly link: string | null }, Errors.SourceFailed>
  readonly change: (
    calendar: Reclaim.SourceCalendar,
    target: Target,
    write: Write
  ) => Effect.Effect<void, Errors.SourceFailed>
  readonly cancel: (calendar: Reclaim.SourceCalendar, target: Target) => Effect.Effect<void, Errors.SourceFailed>
}
