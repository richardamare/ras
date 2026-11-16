import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import type * as SqlClient from "effect/sql/SqlClient"
import * as Module from "@ras/kernel/Module"
import * as Actor from "./Actor.ts"
import * as Http from "./Http.ts"
import * as Global from "./Module.ts"

export const owner = new Actor.Actor({ channel: { _tag: "Console" }, agent: Option.none() })

/** A fresh in-memory database holding the tables of global and `modules`. */
export const database = (modules: ReadonlyArray<Module.Module>) =>
  Layer.effectDiscard(Effect.orDie(Module.migrate([Global.module, ...modules]))).pipe(
    Layer.provideMerge(SqliteClient.layer({ filename: ":memory:" }))
  )

/** The owner, signed in at the console. */
export const signedIn = Layer.mergeAll(
  Layer.succeed(Actor.CurrentActor, owner),
  Layer.succeed(Http.Authenticated, (httpEffect) => Effect.provideService(httpEffect, Actor.CurrentActor, owner))
)

/** Global and `modules`, composed as apps/api composes them, over a fresh database with the owner signed in. */
const compose = Module.services as unknown as (modules: ReadonlyArray<Module.Module>) => Layer.Layer<never>

export const layer = <const Ms extends ReadonlyArray<Module.Module>>(
  ...modules: Ms
): Layer.Layer<
  | Module.Services<readonly [typeof Global.module, ...Ms]>
  | Actor.CurrentActor
  | Http.Authenticated
  | SqlClient.SqlClient
> =>
  compose([Global.module, ...modules]).pipe(Layer.provideMerge(database(modules)), Layer.provideMerge(signedIn)) as any
