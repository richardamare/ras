import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as Global from "@ras/global"
import * as Sql from "@ras/kernel/Sql"
import * as Calendar from "./Calendar.ts"
import type * as Reclaim from "../reclaim/Reclaim.ts"

/** The providers ras writes plain events through. */
export type Provider = "outlook" | "google"

/** An account connected to ras for writes, by the provider that writes its calendars. */
export interface Account {
  readonly provider: Provider
  readonly email: string
}

/** A connected calendar with its settings and the handles a write to its provider needs. */
export interface Connected {
  readonly calendar: Calendar.Calendar
  readonly source: Reclaim.SourceCalendar
  /** The provider that writes it, when its account is connected to ras. */
  readonly provider: Option.Option<Provider>
}

const CalendarRow = Schema.Struct({
  id: Calendar.CalendarId,
  name: Schema.String,
  color: Schema.String,
  account: Schema.Int,
  email: Schema.String,
  providerId: Schema.NullOr(Schema.String),
  enabled: Schema.BooleanFromBit
})
type CalendarRow = typeof CalendarRow.Type

/** The calendars of an account connected to ras take plain events. */
const toConnected =
  (accounts: ReadonlyArray<Account>) =>
  (row: CalendarRow): Connected => {
    const provider = Option.map(
      Arr.findFirst(accounts, (account) => account.email.toLowerCase() === row.email.toLowerCase()),
      (account) => account.provider
    )
    return {
      calendar: new Calendar.Calendar({
        id: row.id,
        name: row.name,
        color: row.color,
        writable: Option.isSome(provider),
        enabled: row.enabled
      }),
      source: {
        id: row.id,
        name: row.name,
        color: row.color,
        account: row.account,
        email: row.email,
        providerId: Option.fromNullOr(row.providerId)
      },
      provider
    }
  }

/** The calendars Reclaim listed in the last sync, and the owner's settings for each. */
export class CalendarRepository extends Context.Service<
  CalendarRepository,
  {
    /** The calendars Reclaim listed in the last sync, in its order. */
    readonly connected: (accounts: ReadonlyArray<Account>) => Effect.Effect<ReadonlyArray<Connected>>
    readonly change: (calendar: Calendar.Calendar) => Effect.Effect<void, never, Global.Transaction>
  }
>()("@ras/calendar/CalendarRepository") {
  static readonly layer = Layer.effect(
    CalendarRepository,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      return CalendarRepository.of({
        connected: (accounts) =>
          Sql.rows(
            CalendarRow,
            sql`
              SELECT id, name, color, account, email, provider_id AS "providerId", enabled
              FROM calendar_calendars WHERE connected = 1 ORDER BY position`
          ).pipe(Effect.map(Arr.map(toConnected(accounts)))),

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
