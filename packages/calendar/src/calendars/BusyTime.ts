import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Domain from "../Domain.ts"

/** A work block planned as a draft: it has no event yet, but its time is taken. */
export interface BlockDraft {
  readonly id: string
  readonly calendar: Domain.CalendarId
  readonly title: string
  readonly span: Domain.Span
}

/** The time `work` has planned and not confirmed; `work` provides it, so `calendar` never imports `work`. */
export class BusyTime extends Context.Service<
  BusyTime,
  { readonly drafts: (span: Domain.Span) => Effect.Effect<ReadonlyArray<BlockDraft>> }
>()("@ras/calendar/BusyTime") {
  /** No block drafts, for a calendar composed without `work`. */
  static readonly none = Layer.succeed(BusyTime, BusyTime.of({ drafts: () => Effect.succeed([]) }))
}
