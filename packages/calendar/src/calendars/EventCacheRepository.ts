import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as Sql from "@ras/kernel/Sql"
import * as Time from "@ras/kernel/Time"
import * as Domain from "../Domain.ts"
import type * as Reclaim from "../reclaim/Reclaim.ts"

/** When the cache was last filled, and the span of time it holds. */
export interface SyncState {
  readonly syncedAt: DateTime.Utc
  readonly from: DateTime.Utc
  readonly to: DateTime.Utc
}

const SyncRow = Schema.Struct({ syncedAt: Time.Instant, from: Time.Instant, to: Time.Instant })
type SyncRow = typeof SyncRow.Type

const toSyncState = (row: SyncRow): SyncState => ({ syncedAt: row.syncedAt, from: row.from, to: row.to })

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
type EventRow = typeof EventRow.Type

const toEntry = (row: EventRow): Domain.Entry => ({
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
})

const encodeAttendees = Schema.encodeSync(Schema.fromJsonString(Schema.Array(Domain.Attendee)))

/** The cache of what Reclaim holds: the events of a span and when they were read. */
export class EventCacheRepository extends Context.Service<
  EventCacheRepository,
  {
    readonly state: Effect.Effect<Option.Option<SyncState>>
    /** The cached events that overlap the span. */
    readonly events: (span: Domain.Span) => Effect.Effect<ReadonlyArray<Domain.Entry>>
    /**
     * Replaces the cache with what Reclaim holds: every event of the span, and the calendars it listed. A calendar
     * Reclaim no longer lists keeps its row and its settings, marked not connected. It runs in its own transaction and
     * is not audited, since it only mirrors Reclaim.
     */
    readonly replace: (
      calendars: ReadonlyArray<Reclaim.SourceCalendar>,
      entries: ReadonlyArray<Domain.Entry>,
      span: Domain.Span,
      at: DateTime.Utc
    ) => Effect.Effect<void>
  }
>()("@ras/calendar/EventCacheRepository") {
  static readonly layer = Layer.effect(
    EventCacheRepository,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      return EventCacheRepository.of({
        state: Sql.rows(
          SyncRow,
          sql`SELECT synced_at AS "syncedAt", from_at AS "from", to_at AS "to" FROM calendar_syncs WHERE id = 1`
        ).pipe(Effect.map((found) => Option.map(Sql.first(found), toSyncState))),

        events: (span) =>
          Sql.rows(
            EventRow,
            sql`
              SELECT calendar_id AS calendar, event_id AS id, date, title, start_at AS start, end_at AS "end",
                     all_day AS "allDay", kind, show_as AS "showAs", rsvp, cancelled, recurring, location, category, notes,
                     attendees, copy_of AS "copyOf"
              FROM calendar_events
              WHERE start_at < ${DateTime.formatIso(span.end)} AND end_at > ${DateTime.formatIso(span.start)}
              ORDER BY start_at, title`
          ).pipe(Effect.map(Arr.map(toEntry))),

        replace: (calendars, entries, span, at) =>
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
      })
    })
  )
}
