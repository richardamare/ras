import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as Global from "@ras/global"
import * as Sql from "@ras/kernel/Sql"
import * as Domain from "../Domain.ts"
import type * as Reclaim from "../reclaim/Reclaim.ts"

/** A connected calendar with its settings and the handles a write to its provider needs. */
export interface Connected {
  readonly calendar: Domain.Calendar
  readonly source: Reclaim.SourceCalendar
}

const CalendarRow = Schema.Struct({
  id: Domain.CalendarId,
  name: Schema.String,
  color: Schema.String,
  account: Schema.Int,
  email: Schema.String,
  providerId: Schema.NullOr(Schema.String),
  enabled: Schema.BooleanFromBit
})
type CalendarRow = typeof CalendarRow.Type

/** The calendars of the `writable` account take plain events. */
const toConnected =
  (writable: Option.Option<string>) =>
  (row: CalendarRow): Connected => ({
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
  })

/** The calendars Reclaim listed in the last sync, and the owner's settings for each. */
export class CalendarRepository extends Context.Service<
  CalendarRepository,
  {
    /** The calendars Reclaim listed in the last sync, in its order. */
    readonly connected: (writable: Option.Option<string>) => Effect.Effect<ReadonlyArray<Connected>>
    readonly change: (calendar: Domain.Calendar) => Effect.Effect<void, never, Global.Transaction>
  }
>()("@ras/calendar/CalendarRepository") {
  static readonly layer = Layer.effect(
    CalendarRepository,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      return CalendarRepository.of({
        connected: (writable) =>
          Sql.rows(
            CalendarRow,
            sql`
              SELECT id, name, color, account, email, provider_id AS "providerId", enabled
              FROM calendar_calendars WHERE connected = 1 ORDER BY position`
          ).pipe(Effect.map(Arr.map(toConnected(writable)))),

        change: (calendar) =>
          Global.write(
            sql`UPDATE calendar_calendars SET enabled = ${calendar.enabled ? 1 : 0} WHERE id = ${calendar.id}`.pipe(
              Effect.asVoid,
              Effect.orDie
            )
          )
      })
    })
  )
}
