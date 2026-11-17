import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as Semaphore from "effect/Semaphore"
import * as Global from "@ras/global"
import * as Errors from "@ras/kernel/Errors"
import * as Clone from "../clone/Clone.ts"
import * as Registry from "../registry/Registry.ts"
import * as Fact from "./Fact.ts"
import * as SearchIndexRepository from "./SearchIndexRepository.ts"

export const Index = Schema.Struct({
  facts: Schema.Array(Fact.Entry),
  invalid: Schema.Array(Fact.Invalid),
  kinds: Schema.Array(Registry.Summary),
  registry: Schema.NullOr(Schema.String).annotate({
    description: "What is wrong with registry.yaml; while it is wrong, its last valid version is in force."
  })
})
export type Index = typeof Index.Type

export const Filter = Schema.Struct({
  kind: Schema.optionalKey(Schema.String),
  folder: Schema.optionalKey(Schema.String.annotate({ description: "A folder, such as `sops/kalendarnik`." }))
})
export type Filter = typeof Filter.Type

export const Read = Schema.Struct({
  facts: Schema.Array(Fact.Fact),
  invalid: Schema.Array(Fact.Invalid),
  missing: Schema.Array(Schema.String)
})
export type Read = typeof Read.Type

export const Written = Schema.Struct({ path: Fact.Path, kind: Schema.String, version: Fact.Version })
export type Written = typeof Written.Type

/** A read pulls first when the last pull is older than this, so a missed webhook heals itself. */
const staleAfter = Duration.minutes(1)

const action = Schema.Literals(["memory.fact.written", "memory.fact.deleted"])

/** The registry in force, and what is wrong with `registry.yaml` when it could not replace it. */
interface Loaded {
  readonly registry: Registry.Registry
  readonly error: Option.Option<string>
}

interface Scan {
  readonly facts: ReadonlyArray<Fact.Fact>
  readonly invalid: ReadonlyArray<Fact.Invalid>
}

const scan = (registry: Registry.Registry, files: ReadonlyArray<Clone.File>): Scan => {
  const [facts, invalid] = Arr.partition(files, (file) => Fact.parse(registry, file.path, file.content))
  return { facts, invalid }
}

/** The file the clone holds at a path: its version and content, a fact or not. */
interface Current {
  readonly version: string
  readonly content: string
}

const snapshot = (content: Option.Option<string>) => Option.map(content, (text) => ({ content: text }))

const refused = (code: string, reason: string, instead: string) =>
  Effect.fail(new Errors.Refused({ code: `memory.${code}`, reason, instead }))

const changed = (path: string, found: Current) =>
  refused(
    "fact.changed",
    `The fact ${path} changed since it was read. Its current text, version ${found.version}:\n\n${found.content}`,
    "Merge your change into the current text and write it with the current version."
  )

const refuseSecret = (draft: Fact.Draft) =>
  Option.match(Fact.secretIn(`${JSON.stringify(draft.properties)}\n${draft.text}`), {
    onNone: () => Effect.void,
    onSome: (kind) =>
      refused(
        "fact.secret",
        `The fact looks like it holds ${kind}. Memory is shared with every agent and kept in git history.`,
        "Keep the secret in 1Password and write only where to find it."
      )
  })

const propertiesOf = (found: Option.Option<Current>): Fact.Properties =>
  Option.match(found, {
    onNone: () => ({}),
    onSome: (current) =>
      Result.match(Fact.split(current.content), { onFailure: () => ({}), onSuccess: (file) => file.properties })
  })

const forbidden = (place: Registry.Place, properties: Fact.Properties, path: string) =>
  refused(
    "write.forbidden",
    `You may not write ${path}. ${Registry.writers(place, properties)}`,
    "Ask the owner to make the change, or write a file of a kind you may write."
  )

const inFolder = (path: string, folder: string) => path.startsWith(`${folder.replace(/\/+$/, "")}/`)

export class Memory extends Context.Service<
  Memory,
  {
    readonly index: (filter: Filter) => Effect.Effect<Index, Errors.SourceFailed>
    readonly read: (paths: ReadonlyArray<string>) => Effect.Effect<Read, Errors.SourceFailed>
    readonly search: (query: string, limit: number) => Effect.Effect<ReadonlyArray<Fact.Hit>, Errors.SourceFailed>
    /** Creates the fact, or changes it when `version` is the version on disk. */
    readonly write: (
      draft: Fact.Draft,
      version: Option.Option<string>
    ) => Effect.Effect<Written, Errors.Refused | Errors.SourceFailed, Global.CurrentActor>
    readonly remove: (
      path: Fact.Path,
      version: string
    ) => Effect.Effect<void, Errors.Refused | Errors.NotFound | Errors.SourceFailed, Global.CurrentActor>
    /** Pulls, reads the registry again and rebuilds the search index, as the GitHub webhook asks. */
    readonly sync: Effect.Effect<void, Errors.SourceFailed>
  }
>()("@ras/memory/Memory") {
  static readonly layer = Layer.effect(
    Memory,
    Effect.gen(function* () {
      const clone = yield* Clone.Clone
      const writes = yield* Global.Writes
      const agents = yield* Global.Agents
      const index = yield* SearchIndexRepository.SearchIndexRepository
      const queue = yield* Semaphore.make(1)
      const pulledAt = yield* Ref.make(Option.none<DateTime.Utc>())
      const loaded = yield* Ref.make<Loaded>({ registry: Registry.empty, error: Option.none() })

      const pull = Effect.gen(function* () {
        yield* clone.pull
        yield* Ref.set(pulledAt, Option.some(yield* DateTime.now))
        const content = yield* clone.read(Registry.file)
        yield* Ref.update(loaded, (before) =>
          Option.match(content, {
            onNone: () => ({
              ...before,
              error: Option.some(`The memory repository has no ${Registry.file}, so no file in it is a fact.`)
            }),
            onSome: (text) =>
              Result.match(Registry.parse(text), {
                onFailure: (error) => ({ ...before, error: Option.some(error) }),
                onSuccess: (registry) => ({ registry, error: Option.none() })
              })
          })
        )
      })

      const scanned = Effect.gen(function* () {
        const { registry } = yield* Ref.get(loaded)
        return scan(registry, yield* clone.files)
      })

      const reindex = Effect.flatMap(scanned, ({ facts }) => index.replace(facts))

      const sync = queue.withPermits(1)(Effect.andThen(pull, reindex))

      const fresh = Effect.gen(function* () {
        const now = yield* DateTime.now
        const last = yield* Ref.get(pulledAt)
        const stale = Option.match(last, {
          onNone: () => true,
          onSome: (at) => Duration.isGreaterThan(DateTime.distance(at, now), staleAfter)
        })
        if (stale) yield* sync
      })

      const current = (path: string) =>
        Effect.map(
          clone.read(path),
          Option.map((content): Current => ({ version: Fact.version(content), content }))
        )

      const acting = Effect.map(Effect.service(Global.CurrentActor), (actor) =>
        Option.map(actor.agent, (agent) => agent as string)
      )

      /**
       * Pulls under the write queue, lets `decide` check the file at `path` and say what it becomes and of which kind,
       * commits it and pushes. A push the remote rejects pulls, decides again and tries once more; a second rejection refuses.
       */
      const publish = <E>(
        path: string,
        decide: (
          registry: Registry.Registry,
          before: Option.Option<Current>
        ) => Effect.Effect<Option.Option<{ readonly content: string; readonly kind: string }>, E>
      ) =>
        queue.withPermits(1)(
          Effect.gen(function* () {
            const agent = yield* acting
            const who = Option.getOrElse(agent, () => "owner")
            const attempt = Effect.gen(function* () {
              yield* pull
              const before = yield* current(path)
              const after = yield* decide((yield* Ref.get(loaded)).registry, before)
              const content = Option.map(after, (file) => file.content)
              yield* clone.commit({ path, content, message: `memory(${who}): ${path}` })
              const pushed = yield* clone.push
              if (!pushed) yield* clone.undo
              return { pushed, before, after }
            })
            const first = yield* attempt
            const outcome = first.pushed ? first : yield* attempt
            if (!outcome.pushed)
              return yield* refused(
                "push.rejected",
                "GitHub rejected the commit twice, because the memory repository kept changing.",
                "Read the fact again and retry the write."
              )
            yield* reindex
            return outcome
          })
        )

      const audited = (
        verb: typeof action.Type,
        path: string,
        before: Option.Option<Current>,
        after: Option.Option<string>
      ) =>
        writes.run(
          verb,
          Effect.succeed({
            result: undefined,
            subject: `memory/${path}`,
            before: snapshot(Option.map(before, (found) => found.content)),
            after: snapshot(after)
          })
        )

      const knownAgent = (place: Registry.Place, properties: Fact.Properties) =>
        Option.match(Registry.ownerOf(place, properties), {
          onNone: () => Effect.void,
          onSome: (owner) =>
            Effect.flatMap(agents.list, (all) =>
              all.some((one) => one.slug === owner)
                ? Effect.void
                : refused(
                    "agent.unknown",
                    `The ${place.kind.name} ${place.stem} belongs to ${owner}, and ras has no agent ${owner}.`,
                    "Add the agent under Settings first, or put the file under an existing agent."
                  )
            )
        })

      return Memory.of({
        index: (filter) =>
          Effect.gen(function* () {
            yield* fresh
            const { registry, error } = yield* Ref.get(loaded)
            const { facts, invalid } = yield* scanned
            const folder = filter.folder
            const kept = Arr.filter(
              facts,
              (fact) =>
                (filter.kind === undefined || fact.kind === filter.kind) &&
                (folder === undefined || inFolder(fact.path, folder))
            )
            return {
              facts: Arr.map(kept, (fact) => ({ path: fact.path, kind: fact.kind, description: fact.description })),
              invalid: Arr.filter(invalid, (file) => folder === undefined || inFolder(file.path, folder)),
              kinds: Arr.map(registry.kinds, Registry.summaryOf),
              registry: Option.getOrNull(error)
            }
          }),
        read: (paths) =>
          Effect.gen(function* () {
            yield* fresh
            const { facts, invalid } = yield* scanned
            const found = Arr.filter(facts, (fact) => paths.includes(fact.path))
            const broken = Arr.filter(invalid, (file) => paths.includes(file.path))
            return {
              facts: found,
              invalid: broken,
              missing: Arr.filter(
                paths,
                (path) => !found.some((fact) => fact.path === path) && !broken.some((file) => file.path === path)
              )
            }
          }),
        search: (query, limit) =>
          Effect.gen(function* () {
            yield* fresh
            return yield* index.search(query, limit)
          }),
        write: (draft, version) =>
          Effect.gen(function* () {
            yield* refuseSecret(draft)
            const agent = yield* acting
            const decide = (registry: Registry.Registry, before: Option.Option<Current>) =>
              Effect.gen(function* () {
                const place = yield* Option.match(Registry.placeOf(registry, draft.path), {
                  onNone: () =>
                    refused(
                      "path.unknown",
                      `No kind in ${Registry.file} matches ${draft.path}.`,
                      "Call memory_index for the kinds and their paths, and write under one of them."
                    ),
                  onSome: Effect.succeed
                })
                const problems = Registry.problemsOf(place, draft.properties)
                if (problems.length > 0)
                  return yield* refused(
                    "fact.invalid",
                    `${draft.path} breaks the rules of ${place.kind.name}: ${problems.join(" ")}`,
                    "Call memory_index for the kind's properties and fix the write."
                  )
                yield* knownAgent(place, draft.properties)
                const previous = propertiesOf(before)
                if (
                  !Registry.mayWrite(place, draft.properties, agent) ||
                  (Option.isSome(before) && !Registry.mayWrite(place, previous, agent))
                )
                  return yield* forbidden(place, Option.isSome(before) ? previous : draft.properties, draft.path)
                yield* Option.match(before, {
                  onNone: () =>
                    Option.isSome(version)
                      ? refused(
                          "fact.gone",
                          `The fact ${draft.path} was deleted since it was read.`,
                          "Write it again without a version to create it."
                        )
                      : Effect.void,
                  onSome: (existing) =>
                    Option.match(version, {
                      onNone: () =>
                        refused(
                          "fact.exists",
                          `The fact ${draft.path} exists. Its current text, version ${existing.version}:\n\n${existing.content}`,
                          "Pass the version you read to change it."
                        ),
                      onSome: (read) => (read === existing.version ? Effect.void : changed(draft.path, existing))
                    })
                })
                return Option.some({ content: Fact.render(place, draft), kind: place.kind.name })
              })
            const { before, after } = yield* publish(draft.path, decide)
            const written = Option.getOrThrow(after)
            yield* audited("memory.fact.written", draft.path, before, Option.some(written.content))
            return { path: draft.path, kind: written.kind, version: Fact.version(written.content) }
          }),
        remove: (path, version) =>
          Effect.gen(function* () {
            const agent = yield* acting
            const decide = (registry: Registry.Registry, before: Option.Option<Current>) =>
              Effect.gen(function* () {
                const existing = yield* Errors.orNotFound("fact", path)(before)
                if (existing.version !== version) return yield* changed(path, existing)
                const properties = propertiesOf(before)
                yield* Option.match(Registry.placeOf(registry, path), {
                  onNone: () =>
                    Option.isSome(agent)
                      ? refused(
                          "write.forbidden",
                          `${path} is not a fact of any kind, so only the owner deletes it.`,
                          "Ask the owner to delete it."
                        )
                      : Effect.void,
                  onSome: (place) =>
                    Registry.mayWrite(place, properties, agent) ? Effect.void : forbidden(place, properties, path)
                })
                return Option.none<{ readonly content: string; readonly kind: string }>()
              })
            const { before } = yield* publish(path, decide)
            yield* audited("memory.fact.deleted", path, before, Option.none())
          }),
        sync
      })
    })
  )
}
