import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as Global from "@ras/global"
import * as Sql from "@ras/kernel/Sql"
import * as Time from "@ras/kernel/Time"
import * as Calendar from "../model/Calendar.ts"
import * as Span from "../model/Span.ts"
import * as Event from "../model/Event.ts"

/** A plain event drafted in ras; it reaches its calendar only once the owner confirms it. */
export interface Draft {
  readonly id: Event.DraftId
  readonly calendar: Calendar.CalendarId
  readonly title: string
  readonly span: Span.Span
  readonly allDay: boolean
  readonly location: Option.Option<string>
  readonly notes: Option.Option<string>
  readonly showAs: Option.Option<Event.ShowAs>
  readonly refusal: Option.Option<string>
}

const DraftRow = Schema.Struct({
  id: Event.DraftId,
  calendar: Calendar.CalendarId,
  title: Schema.String,
  start: Time.Instant,
  end: Time.Instant,
  allDay: Schema.BooleanFromBit,
  location: Schema.NullOr(Schema.String),
  notes: Schema.NullOr(Schema.String),
  showAs: Schema.NullOr(Event.ShowAs),
  refusal: Schema.NullOr(Schema.String)
})
type DraftRow = typeof DraftRow.Type

const toDraft = (row: DraftRow): Draft => ({
  id: row.id,
  calendar: row.calendar,
  title: row.title,
  span: { start: row.start, end: row.end },
  allDay: row.allDay,
  location: Option.fromNullOr(row.location),
  notes: Option.fromNullOr(row.notes),
  showAs: Option.fromNullOr(row.showAs),
  refusal: Option.fromNullOr(row.refusal)
})

const write = <A, E>(statement: Effect.Effect<A, E>) => Global.write(Effect.asVoid(Effect.orDie(statement)))

/** The plain events drafted in ras and not yet confirmed. */
export class DraftRepository extends Context.Service<
  DraftRepository,
  {
    /** The drafts that overlap the span. */
    readonly inSpan: (span: Span.Span) => Effect.Effect<ReadonlyArray<Draft>>
    readonly all: Effect.Effect<ReadonlyArray<Draft>>
    readonly byId: (id: Event.DraftId) => Effect.Effect<Option.Option<Draft>>
    readonly save: (draft: Draft, at: string) => Effect.Effect<void, never, Global.Transaction>
    readonly delete: (id: Event.DraftId) => Effect.Effect<void, never, Global.Transaction>
    readonly deleteAll: Effect.Effect<void, never, Global.Transaction>
  }
>()("@ras/calendar/DraftRepository") {
  static readonly layer = Layer.effect(
    DraftRepository,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const draftsWhere = (where: ReturnType<SqlClient.SqlClient["unsafe"]>) =>
        Sql.rows(
          DraftRow,
          sql`
            SELECT id, calendar_id AS calendar, title, start_at AS start, end_at AS "end", all_day AS "allDay", location,
                   notes, show_as AS "showAs", refusal
            FROM calendar_drafts WHERE ${where} ORDER BY start_at, title`
        ).pipe(Effect.map(Arr.map(toDraft)))

      return DraftRepository.of({
        inSpan: (span) =>
          draftsWhere(sql`start_at < ${DateTime.formatIso(span.end)} AND end_at > ${DateTime.formatIso(span.start)}`),

        all: draftsWhere(sql`1 = 1`),

        byId: (id) => Effect.map(draftsWhere(sql`id = ${id}`), Sql.first),

        save: (draft, at) =>
          write(
            sql`
              INSERT INTO calendar_drafts (id, calendar_id, title, start_at, end_at, all_day, location, notes, show_as,
                                           refusal, created_at)
              VALUES (${draft.id}, ${draft.calendar}, ${draft.title}, ${DateTime.formatIso(draft.span.start)},
                      ${DateTime.formatIso(draft.span.end)}, ${draft.allDay ? 1 : 0}, ${Option.getOrNull(draft.location)},
                      ${Option.getOrNull(draft.notes)}, ${Option.getOrNull(draft.showAs)}, ${Option.getOrNull(draft.refusal)},
                      ${at})
              ON CONFLICT (id) DO UPDATE SET
                title = excluded.title, start_at = excluded.start_at, end_at = excluded.end_at, all_day = excluded.all_day,
                location = excluded.location, notes = excluded.notes, show_as = excluded.show_as, refusal = excluded.refusal`
          ),

        delete: (id) => write(sql`DELETE FROM calendar_drafts WHERE id = ${id}`),

        deleteAll: write(sql`DELETE FROM calendar_drafts`)
      })
    })
  )
}
