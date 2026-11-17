import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import * as Time from "@ras/kernel/Time"

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
