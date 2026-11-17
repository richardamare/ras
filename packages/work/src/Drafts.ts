import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Calendar from "@ras/calendar"
import * as Global from "@ras/global"
import * as Errors from "@ras/kernel/Errors"
import * as Time from "@ras/kernel/Time"
import * as Blocks from "./Blocks.ts"
import * as Domain from "./Domain.ts"
import * as BlockRepository from "./BlockRepository.ts"

interface Pending {
  readonly id: string
  readonly title: string
  readonly start: Time.PragueLocal
  readonly confirm: Effect.Effect<
    unknown,
    Errors.Refused | Errors.NotFound | Errors.Invalid | Errors.SourceFailed,
    Global.CurrentActor
  >
}

/** Event drafts and block drafts, confirmed or discarded together. */
export class Drafts extends Context.Service<
  Drafts,
  {
    /** Confirms the drafts named, a day's drafts, or every draft; a draft its calendar refuses stays, with the reason. */
    readonly confirm: (
      selection: Domain.ConfirmDrafts
    ) => Effect.Effect<Domain.DraftsConfirmed, Errors.Invalid, Global.CurrentActor>
    /** Deletes every draft of both kinds and answers how many there were. */
    readonly discard: Effect.Effect<number, never, Global.CurrentActor>
  }
>()("@ras/work/Drafts") {
  static readonly layer = Layer.effect(
    Drafts,
    Effect.gen(function* () {
      const storedBlocks = yield* BlockRepository.BlockRepository
      const writes = yield* Global.Writes
      const events = yield* Calendar.Events
      const blocks = yield* Blocks.Blocks

      const pending = Effect.gen(function* () {
        const eventDrafts = (yield* events.drafts).map((event): Pending => ({
          id: event.id,
          title: event.title,
          start: event.start,
          confirm: events.confirm(event.id)
        }))
        const blockDrafts = (yield* storedBlocks.allDrafts).map((row): Pending => ({
          id: row.id,
          title: row.title,
          start: Time.toPragueLocal(row.start),
          confirm: blocks.confirm(row.id)
        }))
        return [...eventDrafts, ...blockDrafts].toSorted((a, b) => a.start.localeCompare(b.start))
      })

      const chosen = (all: ReadonlyArray<Pending>, selection: Domain.ConfirmDrafts) =>
        Effect.gen(function* () {
          const { day, drafts } = selection
          if (drafts !== undefined && day !== undefined)
            return yield* new Errors.Invalid({ reason: "Name the drafts or a day, not both." })
          if (day !== undefined) return all.filter((draft) => draft.start.startsWith(day))
          if (drafts === undefined) return all
          const missing = drafts.filter((id) => !all.some((draft) => draft.id === id))
          if (missing.length > 0)
            return yield* new Errors.Invalid({
              reason: `Not a draft: ${missing.join(", ")}. Find the drafts with search_calendar.`
            })
          return all.filter((draft) => drafts.includes(draft.id))
        })

      const outcome = (draft: Pending) =>
        draft.confirm.pipe(
          Effect.as(Option.none<string>()),
          Effect.catch((error) => Effect.succeed(Option.some(error.message))),
          Effect.map(
            (refusal) =>
              new Domain.DraftOutcome({
                id: draft.id,
                title: draft.title,
                start: draft.start,
                refusal: Option.getOrNull(refusal)
              })
          )
        )

      return Drafts.of({
        confirm: (selection) =>
          Effect.gen(function* () {
            const outcomes = yield* Effect.forEach(yield* chosen(yield* pending, selection), outcome)
            return new Domain.DraftsConfirmed({
              confirmed: outcomes.filter((each) => each.refusal === null),
              refused: outcomes.filter((each) => each.refusal !== null)
            })
          }),

        discard: Effect.gen(function* () {
          const eventDrafts = yield* events.discardDrafts
          const blockDrafts = yield* storedBlocks.allDrafts
          if (blockDrafts.length === 0) return eventDrafts
          return yield* writes.run(
            "work.block.discarded",
            Effect.as(storedBlocks.deleteDrafts, {
              result: eventDrafts + blockDrafts.length,
              subject: "blocks",
              before: Option.some({
                drafts: blockDrafts.map((row) => `${row.title} ${Time.toPragueLocal(row.start)}`)
              }),
              after: Option.none()
            })
          )
        })
      })
    })
  )
}
