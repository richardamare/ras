import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import * as Calendar from "@ras/calendar"
import * as Global from "@ras/global"
import * as Sql from "@ras/kernel/Sql"
import * as Domain from "../Domain.ts"

const SpaceRow = Schema.Struct({
  id: Domain.SpaceId,
  name: Schema.String,
  color: Domain.Color,
  position: Schema.Int,
  calendar: Schema.NullOr(Schema.NumberFromString.pipe(Schema.decodeTo(Calendar.CalendarId))),
  default: Schema.BooleanFromBit,
  archived: Schema.BooleanFromBit
})
type SpaceRow = typeof SpaceRow.Type

const toSpace = (row: SpaceRow): Domain.Space => new Domain.Space(row)

/** The column keeps the calendar's id as text. */
const calendarText = (space: Domain.Space) => (space.calendar === null ? null : String(space.calendar))

const write = <A, E>(statement: Effect.Effect<A, E>) => Global.write(Effect.asVoid(Effect.orDie(statement)))

export class SpaceRepository extends Context.Service<
  SpaceRepository,
  {
    readonly all: Effect.Effect<ReadonlyArray<Domain.Space>>
    readonly byId: (id: string) => Effect.Effect<Option.Option<Domain.Space>>
    readonly defaultSpace: Effect.Effect<Domain.Space>
    readonly insert: (space: Domain.Space) => Effect.Effect<void, never, Global.Transaction>
    /** A space made the default takes that from the one that was. */
    readonly update: (space: Domain.Space) => Effect.Effect<void, never, Global.Transaction>
    readonly archive: (id: Domain.SpaceId, at: string) => Effect.Effect<void, never, Global.Transaction>
  }
>()("@ras/work/SpaceRepository") {
  static readonly layer = Layer.effect(
    SpaceRepository,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const columns = sql`SELECT id, name, color, position, calendar, is_default AS "default", archived_at IS NOT NULL AS archived FROM work_spaces`

      return SpaceRepository.of({
        all: Sql.rows(SpaceRow, sql`${columns} ORDER BY position, name`).pipe(Effect.map(Arr.map(toSpace))),

        byId: (id) =>
          Sql.rows(SpaceRow, sql`${columns} WHERE id = ${id}`).pipe(
            Effect.map((found) => Option.map(Sql.first(found), toSpace))
          ),

        defaultSpace: Sql.rows(SpaceRow, sql`${columns} WHERE is_default = 1`).pipe(
          Effect.map((found) => toSpace(found[0]!))
        ),

        insert: (space) =>
          write(sql`
            INSERT INTO work_spaces (id, name, color, position, calendar, is_default)
            VALUES (${space.id}, ${space.name}, ${space.color}, ${space.position}, ${calendarText(space)}, 0)`),

        update: (space) =>
          write(
            Effect.gen(function* () {
              if (space.default)
                yield* sql`UPDATE work_spaces SET is_default = 0 WHERE is_default = 1 AND id != ${space.id}`
              yield* sql`
                UPDATE work_spaces
                SET name = ${space.name}, color = ${space.color}, position = ${space.position},
                    calendar = ${calendarText(space)}, is_default = ${space.default ? 1 : 0}
                WHERE id = ${space.id}`
            })
          ),

        archive: (id, at) => write(sql`UPDATE work_spaces SET archived_at = ${at} WHERE id = ${id}`)
      })
    })
  )
}
