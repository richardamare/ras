import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Errors from "./Errors.ts"

export const prague = DateTime.zoneMakeNamedUnsafe("Europe/Prague")

/** A UTC instant; the database stores it as ISO text. */
export const Instant = Schema.DateTimeUtcFromString

/** Prague wall-clock time as every tool and screen takes it, `2026-10-22T09:00`; a clock without a date does not parse. */
export const PragueLocal = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)).pipe(
  Schema.brand("PragueLocal")
)
export type PragueLocal = typeof PragueLocal.Type

/** The instant of a Prague local time; a time the daylight-saving change skips or repeats is refused. */
export const toInstant = (local: PragueLocal): Effect.Effect<DateTime.Utc, Errors.Invalid> =>
  DateTime.makeZoned(local, { timeZone: prague, adjustForTimeZone: true, disambiguation: "reject" }).pipe(
    Option.map(DateTime.toUtc),
    Effect.fromOption,
    Effect.mapError(
      () => new Errors.Invalid({ reason: `${local} does not exist in Prague on that day, or exists twice.` })
    )
  )

export const toPragueLocal = (instant: DateTime.Utc): PragueLocal =>
  PragueLocal.make(DateTime.formatIsoZoned(DateTime.setZone(instant, prague)).slice(0, 16))
