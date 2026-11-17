import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import * as Schema from "effect/Schema"
import * as Semaphore from "effect/Semaphore"
import * as SqlClient from "effect/sql/SqlClient"
import * as Global from "@ras/global"
import * as Errors from "@ras/kernel/Errors"
import * as Clone from "./Clone.ts"
import * as Fact from "./Fact.ts"
import * as Store from "./Store.ts"

export const Index = Schema.Struct({ facts: Schema.Array(Fact.Entry), invalid: Schema.Array(Fact.Invalid) })
export type Index = typeof Index.Type

export const Read = Schema.Struct({ facts: Schema.Array(Fact.Fact), missing: Schema.Array(Schema.String) })
export type Read = typeof Read.Type

export const Written = Schema.Struct({ name: Fact.Name, version: Fact.Version })
export type Written = typeof Written.Type

/** A read pulls first when the last pull is older than this, so a missed webhook heals itself. */
const staleAfter = Duration.minutes(1)

const action = Schema.Literals(["memory.fact.written", "memory.fact.deleted"])

interface Scan {
  readonly facts: ReadonlyArray<Fact.Fact>
  readonly invalid: ReadonlyArray<Fact.Invalid>
}

const scan = (files: ReadonlyArray<Clone.File>): Scan => {
  const [facts, invalid] = Arr.partition(files, (file: Clone.File) => Fact.parse(file.file, file.content))
  return { facts, invalid }
}

/** The fact the clone holds under `name`: its file's version and content, valid or not. */
interface Current {
  readonly version: string
  readonly content: string
}

const snapshot = (content: Option.Option<string>) => Option.map(content, (text) => ({ content: text }))

const changed = (name: Fact.Name, found: Current) =>
  new Errors.Refused({
    code: "memory.fact.changed",
    reason: `The fact ${name} changed since it was read. Its current text, version ${found.version}:\n\n${found.content}`,
    instead: "Merge your change into the current text and write it with the current version."
  })

const refuseSecret = (draft: Fact.Draft) =>
  Option.match(Fact.secretIn(`${draft.description}\n${draft.text}`), {
    onNone: () => Effect.void,
    onSome: (kind) =>
      Effect.fail(
        new Errors.Refused({
          code: "memory.fact.secret",
          reason: `The fact looks like it holds ${kind}. Memory is shared with every agent and kept in git history.`,
          instead: "Keep the secret in 1Password and write only where to find it."
        })
      )
  })

export class Memory extends Context.Service<
  Memory,
  {
    readonly index: Effect.Effect<Index, Errors.SourceFailed>
    readonly read: (names: ReadonlyArray<string>) => Effect.Effect<Read, Errors.SourceFailed>
    readonly search: (query: string, limit: number) => Effect.Effect<ReadonlyArray<Store.Hit>, Errors.SourceFailed>
    /** Creates the fact, or changes it when `version` is the version on disk. */
    readonly write: (
      draft: Fact.Draft,
      version: Option.Option<string>
    ) => Effect.Effect<Written, Errors.Refused | Errors.SourceFailed, Global.CurrentActor>
    readonly remove: (
      name: Fact.Name,
      version: string
    ) => Effect.Effect<void, Errors.Refused | Errors.NotFound | Errors.SourceFailed, Global.CurrentActor>
    /** Pulls and rebuilds the search index, as the GitHub webhook asks. */
    readonly sync: Effect.Effect<void, Errors.SourceFailed>
  }
>()("@ras/memory/Memory") {
  static readonly layer = Layer.effect(
    Memory,
    Effect.gen(function* () {
      const clone = yield* Clone.Clone
      const writes = yield* Global.Writes
      const services = yield* Effect.context<SqlClient.SqlClient>()
      const queue = yield* Semaphore.make(1)
      const pulledAt = yield* Ref.make(Option.none<DateTime.Utc>())

      const reindex = Effect.gen(function* () {
        const { facts } = scan(yield* clone.files)
        yield* Effect.provideContext(Store.replace(facts), services)
      })

      const sync = queue.withPermits(1)(
        Effect.gen(function* () {
          yield* clone.pull
          yield* Ref.set(pulledAt, Option.some(yield* DateTime.now))
          yield* reindex
        })
      )

      const fresh = Effect.gen(function* () {
        const now = yield* DateTime.now
        const last = yield* Ref.get(pulledAt)
        const stale = Option.match(last, {
          onNone: () => true,
          onSome: (at) => Duration.isGreaterThan(DateTime.distance(at, now), staleAfter)
        })
        if (stale) yield* sync
      })

      const current = (name: Fact.Name) =>
        Effect.map(
          clone.read(Fact.fileName(name)),
          Option.map((content): Current => ({ version: Fact.version(content), content }))
        )

      const commitAs = Effect.map(Effect.service(Global.CurrentActor), (actor) =>
        Option.match(actor.agent, {
          onNone: () => ({ who: "owner", author: Option.none<Clone.Author>() }),
          onSome: (agent) => ({
            who: agent as string,
            author: Option.some({ name: agent, email: `${agent}@agents.ras.invalid` })
          })
        })
      )

      /**
       * Commits one file under the write queue and pushes it. A push the remote rejects pulls, checks the version
       * again and tries once more; a second rejection refuses the write.
       */
      const publish = <E>(
        name: Fact.Name,
        check: (found: Option.Option<Current>) => Effect.Effect<void, E>,
        content: Option.Option<string>
      ) =>
        queue.withPermits(1)(
          Effect.gen(function* () {
            const { who, author } = yield* commitAs
            const attempt = Effect.gen(function* () {
              yield* clone.pull
              const before = yield* current(name)
              yield* check(before)
              yield* clone.commit({ file: Fact.fileName(name), content, message: `memory(${who}): ${name}`, author })
              const pushed = yield* clone.push
              if (!pushed) yield* clone.undo
              return { pushed, before }
            })
            const first = yield* attempt
            const outcome = first.pushed ? first : yield* attempt
            if (!outcome.pushed) {
              return yield* new Errors.Refused({
                code: "memory.push.rejected",
                reason: "GitHub rejected the commit twice, because the memory repository kept changing.",
                instead: "Read the fact again and retry the write."
              })
            }
            yield* Ref.set(pulledAt, Option.some(yield* DateTime.now))
            yield* reindex
            return outcome.before
          })
        )

      const audited = (
        verb: typeof action.Type,
        name: Fact.Name,
        before: Option.Option<Current>,
        after: Option.Option<string>
      ) =>
        writes.run(
          verb,
          Effect.succeed({
            result: undefined,
            subject: `memory/${name}`,
            before: snapshot(Option.map(before, (found) => found.content)),
            after: snapshot(after)
          })
        )

      return Memory.of({
        index: Effect.gen(function* () {
          yield* fresh
          const { facts, invalid } = scan(yield* clone.files)
          return {
            facts: Arr.map(facts, (fact) => ({ name: fact.name, description: fact.description, type: fact.type })),
            invalid
          }
        }),
        read: (names) =>
          Effect.gen(function* () {
            yield* fresh
            const { facts } = scan(yield* clone.files)
            const found = Arr.filter(facts, (fact) => names.includes(fact.name))
            return { facts: found, missing: Arr.filter(names, (name) => !found.some((fact) => fact.name === name)) }
          }),
        search: (query, limit) =>
          Effect.gen(function* () {
            yield* fresh
            return yield* Effect.provideContext(Store.search(query, limit), services)
          }),
        write: (draft, version) =>
          Effect.gen(function* () {
            yield* refuseSecret(draft)
            const content = Fact.render(draft)
            const check = (found: Option.Option<Current>): Effect.Effect<void, Errors.Refused> =>
              Option.match(found, {
                onNone: () =>
                  Option.isSome(version)
                    ? Effect.fail(
                        new Errors.Refused({
                          code: "memory.fact.gone",
                          reason: `The fact ${draft.name} was deleted since it was read.`,
                          instead: "Write it again without a version to create it."
                        })
                      )
                    : Effect.void,
                onSome: (existing) =>
                  Option.match(version, {
                    onNone: () =>
                      Effect.fail(
                        new Errors.Refused({
                          code: "memory.fact.exists",
                          reason: `The fact ${draft.name} exists. Its current text, version ${existing.version}:\n\n${existing.content}`,
                          instead: "Pass the version you read to change it."
                        })
                      ),
                    onSome: (read) =>
                      read === existing.version ? Effect.void : Effect.fail(changed(draft.name, existing))
                  })
              })
            const before = yield* publish(draft.name, check, Option.some(content))
            yield* audited("memory.fact.written", draft.name, before, Option.some(content))
            return { name: draft.name, version: Fact.version(content) }
          }),
        remove: (name, version) =>
          Effect.gen(function* () {
            const check = (found: Option.Option<Current>): Effect.Effect<void, Errors.NotFound | Errors.Refused> =>
              Effect.flatMap(Errors.orNotFound("fact", name)(found), (existing) =>
                existing.version === version ? Effect.void : Effect.fail(changed(name, existing))
              )
            const before = yield* publish(name, check, Option.none())
            yield* audited("memory.fact.deleted", name, before, Option.none())
          }),
        sync
      })
    })
  )
}
