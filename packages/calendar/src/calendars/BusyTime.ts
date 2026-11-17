import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Calendar from "./Calendar.ts"
import type * as Span from "./Span.ts"

/** A work block planned as a draft: it has no event yet, but its time is taken. */
export interface BlockDraft {
  readonly id: string
  readonly calendar: Calendar.CalendarId
  readonly title: string
  readonly span: Span.Span
}

/** The time `work` has planned and not confirmed; `work` provides it, so `calendar` never imports `work`. */
export class BusyTime extends Context.Service<
  BusyTime,
  { readonly drafts: (span: Span.Span) => Effect.Effect<ReadonlyArray<BlockDraft>> }
>()("@ras/calendar/BusyTime") {
  /** No block drafts, for a calendar composed without `work`. */
  static readonly none = Layer.succeed(BusyTime, BusyTime.of({ drafts: () => Effect.succeed([]) }))
}
