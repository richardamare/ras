import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Toolkit from "effect/ai/Toolkit"
import * as HttpApi from "effect/http-api/HttpApi"
import type * as HttpApiGroup from "effect/http-api/HttpApiGroup"
import * as Migrator from "effect/sql/Migrator"
import type * as SqlClient from "effect/sql/SqlClient"

/** Every module builds its handlers against an API with this id, so they serve inside the composed API. */
export const apiId = "ras"
export type ApiId = typeof apiId

/** Keyed `0001_create_audit`: the number orders a module's migrations, which run against its own migrations table. */
export type Migrations = Readonly<Record<`${number}_${string}`, Effect.Effect<void, unknown, SqlClient.SqlClient>>>

type AnyLayer = Layer.Layer<any, any, any>

export interface Http<Name extends string = string> {
  readonly group: HttpApiGroup.Constraint & { readonly identifier: Name }
  readonly handlers: Layer.Any
}

export interface Tools {
  readonly toolkit: Toolkit.Any
  readonly handlers: Layer.Any
}

/**
 * What apps/api needs from one module, and nothing a sibling module calls. `services` is built in list order, so it
 * may need the services of modules listed before it. `ports` implements services that an earlier module declared
 * (work provides calendar's `BusyTime`); ports are built before every module, so they need only what apps/api
 * provides.
 */
export interface Module<Name extends string = string> {
  readonly name: Name
  readonly migrations: Migrations
  readonly services: Layer.Any
  readonly ports: Layer.Any
  readonly http: Http<Name> | undefined
  readonly tools: Tools
  readonly routes: Layer.Any
}

type Defaults = {
  readonly migrations: {}
  readonly services: Layer.Layer<never>
  readonly ports: Layer.Layer<never>
  readonly http: undefined
  readonly tools: { readonly toolkit: Toolkit.Toolkit<{}>; readonly handlers: Layer.Layer<never> }
  readonly routes: Layer.Layer<never>
}

type Filled<D> = { readonly [K in keyof Defaults]: K extends keyof D ? D[K] : Defaults[K] }

/** A module from the slots it fills; an absent slot contributes nothing. */
export const make = <const D extends Partial<Omit<Module, "name">> & { readonly name: string }>(
  definition: D
): { readonly name: D["name"] } & Filled<D> =>
  ({
    migrations: {},
    services: Layer.empty,
    ports: Layer.empty,
    http: undefined,
    tools: { toolkit: Toolkit.empty, handlers: Layer.empty },
    routes: Layer.empty,
    ...definition
  }) as any

type Out<L> = L extends Layer.Layer<infer A, infer _E, infer _R> ? A : never
type In<L> = L extends Layer.Layer<infer _A, infer _E, infer R> ? R : never
type Err<L> = L extends Layer.Layer<infer _A, infer E, infer _R> ? E : never

type PortsOut<Ms extends ReadonlyArray<Module>> = Out<Ms[number]["ports"]>
type ServicesOut<Ms extends ReadonlyArray<Module>> = Out<Ms[number]["services"]>

/** What the modules' services need that no earlier module and no port provides, walking the list in order. */
type Needs<Ms, Available, Need = never> = Ms extends readonly [infer H extends Module, ...infer T]
  ? Needs<T, Available | Out<H["services"]>, Need | Exclude<In<H["services"]>, Available>>
  : Need

type Unprovided<Ms extends ReadonlyArray<Module>> = Needs<Ms, PortsOut<Ms>> | In<Ms[number]["ports"]>

/** A need that only a later module provides, or a port that needs a module's service. */
type OutOfOrder<Ms extends ReadonlyArray<Module>> = Extract<Unprovided<Ms>, ServicesOut<Ms> | PortsOut<Ms>>

type Ordered<Ms extends ReadonlyArray<Module>> = [OutOfOrder<Ms>] extends [never]
  ? unknown
  : { readonly "list each module after the modules whose services it needs": OutOfOrder<Ms> }

export type Services<Ms extends ReadonlyArray<Module>> = ServicesOut<Ms> | PortsOut<Ms>

/** Every module's services and ports as one layer; what it still needs is what apps/api provides. */
export const services = <const Ms extends Arr.NonEmptyReadonlyArray<Module>>(
  modules: Ms & Ordered<Ms>
): Layer.Layer<Services<Ms>, Err<Ms[number]["services"] | Ms[number]["ports"]>, Unprovided<Ms>> => {
  const ports = mergeAll(Arr.map(modules, (module) => module.ports))
  return Arr.reduce(modules, ports, (built, module) => Layer.provideMerge(module.services as AnyLayer, built))
}

type Groups<Ms extends ReadonlyArray<Module>> = Exclude<Ms[number]["http"], undefined>["group"]

export type Api<Ms extends ReadonlyArray<Module>> = HttpApi.HttpApi<ApiId, Groups<Ms>>

export const api = <const Ms extends ReadonlyArray<Module>>(modules: Ms): Api<Ms> =>
  (HttpApi.make(apiId) as any).add(
    ...Arr.flatMap(modules, (module) => (module.http === undefined ? [] : [module.http.group]))
  )

export const toolkit = <const Ms extends Arr.NonEmptyReadonlyArray<Module>>(modules: Ms) =>
  Toolkit.merge(...Arr.map(modules, (module) => module.tools.toolkit as Ms[number]["tools"]["toolkit"]))

type Merged<L> = Layer.Layer<Out<L>, Err<L>, In<L>>

const mergeAll = (layers: ReadonlyArray<Layer.Any>): any =>
  Arr.match(layers as ReadonlyArray<AnyLayer>, {
    onEmpty: () => Layer.empty,
    onNonEmpty: (all) => Layer.mergeAll(...(all as [AnyLayer, ...Array<AnyLayer>]))
  })

export const httpHandlers = <const Ms extends ReadonlyArray<Module>>(
  modules: Ms
): Merged<Exclude<Ms[number]["http"], undefined>["handlers"]> =>
  mergeAll(Arr.flatMap(modules, (module) => (module.http === undefined ? [] : [module.http.handlers])))

export const toolHandlers = <const Ms extends ReadonlyArray<Module>>(
  modules: Ms
): Merged<Ms[number]["tools"]["handlers"]> => mergeAll(Arr.map(modules, (module) => module.tools.handlers))

/** Routes outside the HttpApi, such as sign-in under `/auth` and the GitHub webhook. */
export const routes = <const Ms extends ReadonlyArray<Module>>(modules: Ms): Merged<Ms[number]["routes"]> =>
  mergeAll(Arr.map(modules, (module) => module.routes))

const run = Migrator.make({})

/** Runs each module's migrations against its own table, `<module>_migrations`, in list order. */
export const migrate = (modules: ReadonlyArray<Module>) =>
  Effect.forEach(
    modules,
    (module) => run({ table: `${module.name}_migrations`, loader: Migrator.fromRecord(module.migrations) }),
    { discard: true }
  ).pipe(Effect.withSpan("migrate"))
