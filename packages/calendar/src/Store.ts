import * as Arr from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as Global from "@ras/global"
import * as Time from "@ras/kernel/Time"
import * as Domain from "./Domain.ts"
import type * as Reclaim from "./Reclaim.ts"

const rows = <S extends Schema.Top>(
  schema: S,
  query: Effect.Effect<ReadonlyArray<unknown>, unknown, SqlClient.SqlClient>
) => query.pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(schema))), Effect.orDie)

const CalendarRow = Schema.Struct({
  id: Domain.CalendarId,
  name: Schema.String,
  color: Schema.String,
  account: Schema.Int,
  providerId: Schema.NullOr(Schema.String),
  role: Domain.Role,
  enabled: Schema.BooleanFromBit
})

/** A connected calendar with its settings and the handles a write to its provider needs. */
export interface Connected {
  readonly calendar: Domain.Calendar
  readonly source: Reclaim.SourceCalendar
}

/** The calendars Reclaim listed in the last sync, in its order. */
export const connected = rows(
  CalendarRow,
  SqlClient.SqlClient.use(
    (sql) => sql`
      SELECT id, name, color, account, provider_id AS "providerId", role, enabled
      FROM calendar_calendars WHERE connected = 1 ORDER BY position`
  )
).pipe(
  Effect.map(
    Arr.map((row): Connected => ({
      calendar: new Domain.Calendar({
        id: row.id,
        name: row.name,
        color: row.color,
        role: row.role,
        enabled: row.enabled
      }),
      source: {
        id: row.id,
        name: row.name,
        color: row.color,
        account: row.account,
        providerId: Option.fromNullOr(row.providerId)
      }
    }))
  )
)

export const changeCalendar = (calendar: Domain.Calendar) =>
  Global.write(
    SqlClient.SqlClient.use(
      (sql) =>
        sql`UPDATE calendar_calendars SET role = ${calendar.role}, enabled = ${calendar.enabled ? 1 : 0} WHERE id = ${calendar.id}`
    ).pipe(Effect.asVoid, Effect.orDie)
  )

const SyncRow = Schema.Struct({ syncedAt: Time.Instant, from: Time.Instant, to: Time.Instant })

/** When the cache was last filled, and the span of time it holds. */
export const sync = rows(
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
  rows(
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
          INSERT INTO calendar_calendars (id, name, color, account, provider_id, position, connected)
          VALUES (${calendar.id}, ${calendar.name}, ${calendar.color}, ${calendar.account},
                  ${Option.getOrNull(calendar.providerId)}, ${position}, 1)
          ON CONFLICT (id) DO UPDATE SET
            name = excluded.name, color = excluded.color, account = excluded.account,
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
