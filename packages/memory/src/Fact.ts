import * as Arr from "effect/Array"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"

export const Name = Schema.String.check(Schema.isPattern(/^[a-z0-9]+(-[a-z0-9]+)*$/)).pipe(Schema.brand("FactName"))
export type Name = typeof Name.Type

export const Type = Schema.Literals(["fact", "preference", "rule", "person", "project"])
export type Type = typeof Type.Type

/** The git blob hash of the fact's file, so a version matches what `git hash-object` prints for it. */
export const Version = Schema.String.check(Schema.isPattern(/^[0-9a-f]{40}$/))

const Description = Schema.String.check(Schema.isNonEmpty(), Schema.isPattern(/^[^\n]+$/))

const Frontmatter = Schema.Struct({ name: Name, description: Description, type: Type })

/** What `memory_index` lists of a fact. */
export const Entry = Schema.Struct({ name: Name, description: Schema.String, type: Type })
export type Entry = typeof Entry.Type

export class Fact extends Schema.Class<Fact>("Fact")({
  name: Name,
  description: Schema.String,
  type: Type,
  text: Schema.String,
  version: Version
}) {}

/** A file in the clone that is not a valid fact, and why. */
export const Invalid = Schema.Struct({ file: Schema.String, reason: Schema.String })
export type Invalid = typeof Invalid.Type

/** What a write takes: the fact without its version, with each field checked as a fact file checks it. */
export const Draft = Schema.Struct({ name: Name, description: Description, type: Type, text: Schema.String })
export type Draft = typeof Draft.Type

export const fileName = (name: Name) => `${name}.md`

export const version = (content: string): string => {
  const bytes = new TextEncoder().encode(content)
  return new Bun.CryptoHasher("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex")
}

const decodeFrontmatter = Schema.decodeUnknownResult(Frontmatter)

/** Reads the fact in `file`; the frontmatter must be valid and its `name` must equal the file name. */
export const parse = (file: string, content: string): Result.Result<Fact, Invalid> => {
  const refuse = (reason: string) => Result.fail({ file, reason })
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content)
  if (match === null) return refuse("The file does not open with a `---` frontmatter block.")
  const [, yaml = "", body = ""] = match
  let raw: unknown
  try {
    raw = Bun.YAML.parse(yaml)
  } catch {
    return refuse("The frontmatter is not valid YAML.")
  }
  return Result.match(decodeFrontmatter(raw), {
    onFailure: (issue) => refuse(`The frontmatter needs name, description and type: ${issue.message}`),
    onSuccess: (frontmatter) =>
      fileName(frontmatter.name) === file
        ? Result.succeed(new Fact({ ...frontmatter, text: body.trim(), version: version(content) }))
        : refuse(
            `The frontmatter names \`${frontmatter.name}\`, so the file must be \`${fileName(frontmatter.name)}\`.`
          )
  })
}

export const render = (draft: Draft): string =>
  `---\nname: ${draft.name}\ndescription: ${JSON.stringify(draft.description)}\ntype: ${draft.type}\n---\n\n${draft.text.trim()}\n`

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
