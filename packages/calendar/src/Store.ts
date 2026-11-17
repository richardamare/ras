import * as Arr from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as Global from "@ras/global"
import * as Sql from "@ras/kernel/Sql"
import * as Time from "@ras/kernel/Time"
import * as Domain from "./Domain.ts"
import type * as Reclaim from "./Reclaim.ts"

const CalendarRow = Schema.Struct({
  id: Domain.CalendarId,
  name: Schema.String,
  color: Schema.String,
  account: Schema.Int,
  email: Schema.String,
  providerId: Schema.NullOr(Schema.String),
  enabled: Schema.BooleanFromBit
})

/** A connected calendar with its settings and the handles a write to its provider needs. */
export interface Connected {
  readonly calendar: Domain.Calendar
  readonly source: Reclaim.SourceCalendar
}

/** The calendars Reclaim listed in the last sync, in its order; those of the `writable` account take plain events. */
export const connected = (writable: Option.Option<string>) =>
  Sql.rows(
    CalendarRow,
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT id, name, color, account, email, provider_id AS "providerId", enabled
        FROM calendar_calendars WHERE connected = 1 ORDER BY position`
    )
  ).pipe(
    Effect.map(
      Arr.map((row): Connected => ({
        calendar: new Domain.Calendar({
          id: row.id,
          name: row.name,
          color: row.color,
          writable: Option.exists(writable, (account) => account.toLowerCase() === row.email.toLowerCase()),
          enabled: row.enabled
        }),
        source: {
          id: row.id,
          name: row.name,
          color: row.color,
          account: row.account,
          email: row.email,
          providerId: Option.fromNullOr(row.providerId)
        }
      }))
    )
  )

export const changeCalendar = (calendar: Domain.Calendar) =>
  Global.write(
    SqlClient.SqlClient.use(
      (sql) => sql`UPDATE calendar_calendars SET enabled = ${calendar.enabled ? 1 : 0} WHERE id = ${calendar.id}`
    ).pipe(Effect.asVoid, Effect.orDie)
  )

const SyncRow = Schema.Struct({ syncedAt: Time.Instant, from: Time.Instant, to: Time.Instant })

/** When the cache was last filled, and the span of time it holds. */
export const sync = Sql.rows(
  SyncRow,
  SqlClient.SqlClient.use(
    (sql) => sql`SELECT synced_at AS "syncedAt", from_at AS "from", to_at AS "to" FROM calendar_syncs WHERE id = 1`
  )
).pipe(Effect.map((found) => Arr.head(found)))

const EventRow = Schema.Struct({
  calendar: Domain.CalendarId,
  id: Schema.String,
  date: Time.PragueDate,
  title: Schema.String,
  start: Time.Instant,
  end: Time.Instant,
  allDay: Schema.BooleanFromBit,
  kind: Domain.Kind,
  showAs: Domain.ShowAs,
  rsvp: Domain.Rsvp,
  cancelled: Schema.BooleanFromBit,
  recurring: Schema.BooleanFromBit,
  location: Schema.NullOr(Schema.String),
  category: Schema.NullOr(Schema.String),
  notes: Schema.NullOr(Schema.String),
  attendees: Schema.fromJsonString(Schema.Array(Domain.Attendee)),
  copyOf: Schema.NullOr(Domain.EventId)
})

/** The cached events that overlap the span. */
export const events = (span: Domain.Span) =>
  Sql.rows(
    EventRow,
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT calendar_id AS calendar, event_id AS id, date, title, start_at AS start, end_at AS "end",
               all_day AS "allDay", kind, show_as AS "showAs", rsvp, cancelled, recurring, location, category, notes,
               attendees, copy_of AS "copyOf"
        FROM calendar_events
        WHERE start_at < ${DateTime.formatIso(span.end)} AND end_at > ${DateTime.formatIso(span.start)}
        ORDER BY start_at, title`
    )
  ).pipe(
    Effect.map(
      Arr.map((row): Domain.Entry => ({
        ref: { calendar: row.calendar, date: row.date, id: row.id },
        title: row.title,
        span: { start: row.start, end: row.end },
        allDay: row.allDay,
        kind: row.kind,
        showAs: row.showAs,
        rsvp: row.rsvp,
        cancelled: row.cancelled,
        recurring: row.recurring,
        location: Option.fromNullOr(row.location),
        category: Option.fromNullOr(row.category),
        notes: Option.fromNullOr(row.notes),
        attendees: row.attendees,
        copyOf: Option.map(Option.fromNullOr(row.copyOf), Domain.eventRef)
      }))
    )
  )

const encodeAttendees = Schema.encodeSync(Schema.fromJsonString(Schema.Array(Domain.Attendee)))

/**
 * Replaces the cache with what Reclaim holds: every event of the span, and the calendars it listed. A calendar Reclaim
 * no longer lists keeps its row and its settings, marked not connected.
 */
export const replace = (
  calendars: ReadonlyArray<Reclaim.SourceCalendar>,
  entries: ReadonlyArray<Domain.Entry>,
  span: Domain.Span,
  at: DateTime.Utc
) =>
  SqlClient.SqlClient.use((sql) =>
    Effect.gen(function* () {
      yield* sql`DELETE FROM calendar_events`
      yield* sql`UPDATE calendar_calendars SET connected = 0`
      yield* Effect.forEach(
        calendars,
        (calendar, position) => sql`
          INSERT INTO calendar_calendars (id, name, color, account, email, provider_id, position, connected)
          VALUES (${calendar.id}, ${calendar.name}, ${calendar.color}, ${calendar.account}, ${calendar.email},
                  ${Option.getOrNull(calendar.providerId)}, ${position}, 1)
          ON CONFLICT (id) DO UPDATE SET
            name = excluded.name, color = excluded.color, account = excluded.account, email = excluded.email,
            provider_id = excluded.provider_id, position = excluded.position, connected = 1`,
        { discard: true }
      )
      yield* Effect.forEach(
        entries,
        (entry) => sql`
          INSERT OR IGNORE INTO calendar_events (calendar_id, event_id, date, title, start_at, end_at, all_day, kind,
            show_as, rsvp, cancelled, recurring, location, category, notes, attendees, copy_of)
          VALUES (${entry.ref.calendar}, ${entry.ref.id}, ${entry.ref.date}, ${entry.title},
                  ${DateTime.formatIso(entry.span.start)}, ${DateTime.formatIso(entry.span.end)},
                  ${entry.allDay ? 1 : 0}, ${entry.kind}, ${entry.showAs}, ${entry.rsvp}, ${entry.cancelled ? 1 : 0},
                  ${entry.recurring ? 1 : 0}, ${Option.getOrNull(entry.location)}, ${Option.getOrNull(entry.category)},
                  ${Option.getOrNull(entry.notes)}, ${encodeAttendees(entry.attendees)},
                  ${Option.getOrNull(Option.map(entry.copyOf, Domain.eventId))})`,
        { discard: true }
      )
      yield* sql`
        INSERT INTO calendar_syncs (id, synced_at, from_at, to_at)
        VALUES (1, ${DateTime.formatIso(at)}, ${DateTime.formatIso(span.start)}, ${DateTime.formatIso(span.end)})
        ON CONFLICT (id) DO UPDATE SET synced_at = excluded.synced_at, from_at = excluded.from_at, to_at = excluded.to_at`
    }).pipe(sql.withTransaction, Effect.orDie)
  )

/** A plain event drafted in ras; it reaches its calendar only once the owner confirms it. */
export interface Draft {
  readonly id: Domain.DraftId
  readonly calendar: Domain.CalendarId
  readonly title: string
  readonly span: Domain.Span
  readonly allDay: boolean
  readonly location: Option.Option<string>
  readonly notes: Option.Option<string>
  readonly showAs: Option.Option<Domain.ShowAs>
  readonly refusal: Option.Option<string>
}

const DraftRow = Schema.Struct({
  id: Domain.DraftId,
  calendar: Domain.CalendarId,
  title: Schema.String,
  start: Time.Instant,
  end: Time.Instant,
  allDay: Schema.BooleanFromBit,
  location: Schema.NullOr(Schema.String),
  notes: Schema.NullOr(Schema.String),
  showAs: Schema.NullOr(Domain.ShowAs),
  refusal: Schema.NullOr(Schema.String)
})

const draftsWhere = (where: (sql: SqlClient.SqlClient) => ReturnType<SqlClient.SqlClient["unsafe"]>) =>
  Sql.rows(
    DraftRow,
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT id, calendar_id AS calendar, title, start_at AS start, end_at AS "end", all_day AS "allDay", location,
               notes, show_as AS "showAs", refusal
        FROM calendar_drafts WHERE ${where(sql)} ORDER BY start_at, title`
    )
  ).pipe(
    Effect.map(
      Arr.map((row): Draft => ({
        id: row.id,
        calendar: row.calendar,
        title: row.title,
        span: { start: row.start, end: row.end },
        allDay: row.allDay,
        location: Option.fromNullOr(row.location),
        notes: Option.fromNullOr(row.notes),
        showAs: Option.fromNullOr(row.showAs),
        refusal: Option.fromNullOr(row.refusal)
      }))
    )
  )

export const drafts = (span: Domain.Span) =>
  draftsWhere((sql) => sql`start_at < ${DateTime.formatIso(span.end)} AND end_at > ${DateTime.formatIso(span.start)}`)

export const allDrafts = draftsWhere((sql) => sql`1 = 1`)

export const deleteAllDrafts = Global.write(
  SqlClient.SqlClient.use((sql) => sql`DELETE FROM calendar_drafts`).pipe(Effect.asVoid, Effect.orDie)
)

export const draftById = (id: Domain.DraftId) =>
  Effect.map(
    draftsWhere((sql) => sql`id = ${id}`),
    (found) => Arr.head(found)
  )

export const saveDraft = (draft: Draft, at: string) =>
  Global.write(
    SqlClient.SqlClient.use(
      (sql) => sql`
        INSERT INTO calendar_drafts (id, calendar_id, title, start_at, end_at, all_day, location, notes, show_as,
                                     refusal, created_at)
        VALUES (${draft.id}, ${draft.calendar}, ${draft.title}, ${DateTime.formatIso(draft.span.start)},
                ${DateTime.formatIso(draft.span.end)}, ${draft.allDay ? 1 : 0}, ${Option.getOrNull(draft.location)},
                ${Option.getOrNull(draft.notes)}, ${Option.getOrNull(draft.showAs)}, ${Option.getOrNull(draft.refusal)},
                ${at})
        ON CONFLICT (id) DO UPDATE SET
          title = excluded.title, start_at = excluded.start_at, end_at = excluded.end_at, all_day = excluded.all_day,
          location = excluded.location, notes = excluded.notes, show_as = excluded.show_as, refusal = excluded.refusal`
    ).pipe(Effect.asVoid, Effect.orDie)
  )

export const deleteDraft = (id: Domain.DraftId) =>
  Global.write(
    SqlClient.SqlClient.use((sql) => sql`DELETE FROM calendar_drafts WHERE id = ${id}`).pipe(
      Effect.asVoid,
      Effect.orDie
    )
  )
