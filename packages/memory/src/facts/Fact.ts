import * as Arr from "effect/Array"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as Registry from "../registry/Registry.ts"

export const Path = Schema.String.check(
  Schema.isPattern(/^([A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.md$/)
)
  .annotate({
    description: "The fact's path from the memory repository's root, such as `people/colleagues/jan-novak.md`."
  })
  .pipe(Schema.brand("FactPath"))
export type Path = typeof Path.Type

/** The git blob hash of the fact's file, so a version matches what `git hash-object` prints for it. */
export const Version = Schema.String.check(Schema.isPattern(/^[0-9a-f]{40}$/))

export const Properties = Schema.Record(Schema.String, Schema.Unknown).annotate({
  description:
    "The frontmatter, as the fact's kind in the registry requires it; `description` is the line the index shows."
})
export type Properties = typeof Properties.Type

/** What `memory_index` lists of a fact. */
export const Entry = Schema.Struct({ path: Path, kind: Schema.String, description: Schema.String })
export type Entry = typeof Entry.Type

export class Fact extends Schema.Class<Fact>("Fact")({
  path: Path,
  kind: Schema.String,
  description: Schema.String,
  properties: Properties,
  text: Schema.String,
  version: Version
}) {}

/** A file in the clone that is not a fact, and why. */
export const Invalid = Schema.Struct({ path: Schema.String, reason: Schema.String })
export type Invalid = typeof Invalid.Type

/** What a write takes: the fact without its kind, which its path decides, and without its version. */
export interface Draft {
  readonly path: Path
  readonly properties: Properties
  readonly text: string
}

export const version = (content: string): string => {
  const bytes = new TextEncoder().encode(content)
  return new Bun.CryptoHasher("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex")
}

/** The frontmatter and the text of a Markdown file, or why it has no frontmatter to read. */
export const split = (content: string): Result.Result<{ properties: Properties; text: string }, string> => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content)
  if (match === null) return Result.fail("The file does not open with a `---` frontmatter block.")
  const [, yaml = "", body = ""] = match
  let raw: unknown
  try {
    raw = Bun.YAML.parse(yaml)
  } catch {
    return Result.fail("The frontmatter is not valid YAML.")
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    return Result.fail("The frontmatter is not a set of properties.")
  return Result.succeed({ properties: raw as Properties, text: body.trim() })
}

const noKind = `No kind in ${Registry.file} matches this path.`

/** Reads the file at `path` as a fact of the kind the registry gives its path. */
export const parse = (registry: Registry.Registry, path: string, content: string): Result.Result<Fact, Invalid> => {
  const refuse = (reason: string) => Result.fail({ path, reason })
  return Option.match(Registry.placeOf(registry, path), {
    onNone: () => refuse(noKind),
    onSome: (place) =>
      Result.match(split(content), {
        onFailure: refuse,
        onSuccess: ({ properties, text }) => {
          const problems = Registry.problemsOf(place, properties)
          return problems.length > 0
            ? refuse(problems.join(" "))
            : Result.succeed(
                new Fact({
                  path: path as Path,
                  kind: place.kind.name,
                  description: String(properties["description"]),
                  properties,
                  text,
                  version: version(content)
                })
              )
        }
      })
  })
}

/** The file of a fact: its properties in the order its kind lists them, each as YAML, then the text. */
export const render = (place: Registry.Place, draft: Draft): string => {
  const order = [...Object.keys(place.kind.required), ...Object.keys(place.kind.optional)]
  const keys = Arr.filter(order, (key) => draft.properties[key] !== undefined && draft.properties[key] !== null)
  const lines = Arr.map(keys, (key) => `${key}: ${JSON.stringify(draft.properties[key])}`)
  return `---\n${lines.join("\n")}\n---\n\n${draft.text.trim()}\n`
}

const secrets: ReadonlyArray<readonly [string, RegExp]> = [
  ["a private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["a GitHub token", /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/],
  ["an API key", /\bsk-(ant-|proj-)?[A-Za-z0-9_-]{20,}\b/],
  ["an AWS access key", /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["a Slack token", /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/],
  ["a JSON web token", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ["a password", /\b(password|passwd|heslo|secret|token)\s*[:=]\s*\S{6,}/i]
]

/** The kind of the first secret in `text`, if it holds one. */
export const secretIn = (text: string): Option.Option<string> =>
  Option.map(
    Arr.findFirst(secrets, ([, pattern]) => pattern.test(text)),
    ([kind]) => kind
  )

/** A fact that matches a search, with the matching words of its text marked. */
export const Hit = Schema.Struct({
  path: Path,
  kind: Schema.String,
  description: Schema.String,
  excerpt: Schema.String
})
export type Hit = typeof Hit.Type
