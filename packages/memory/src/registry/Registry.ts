import * as Arr from "effect/Array"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"

/** The registry's file at the memory repository's root. */
export const file = "registry.yaml"

const slug = /^[a-z0-9]+(-[a-z0-9]+)*$/
const day = /^\d{4}-\d{2}-\d{2}$/

const names = {
  kebab: { pattern: slug, example: "jan-novak" },
  date: { pattern: day, example: "2026-11-17" },
  dated: { pattern: /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/, example: "2026-11-17-stop-friday-calls" }
} as const

const Value = Schema.Union([
  Schema.Literals(["line", "text", "date", "boolean", "list", "agent"]),
  Schema.NonEmptyArray(Schema.String)
])
type Value = typeof Value.Type

const Properties = Schema.Record(Schema.String, Value)

const KindFile = Schema.Struct({
  path: Schema.String,
  name: Schema.optionalKey(Schema.Literals(["kebab", "date", "dated"])),
  write: Schema.Literals(["owner", "agents", "own"]),
  required: Schema.optionalKey(Properties),
  optional: Schema.optionalKey(Properties)
})

const RegistryFile = Schema.Struct({ kinds: Schema.Record(Schema.String, KindFile) })

export const Write = Schema.Literals(["owner", "agents", "own"])
export type Write = typeof Write.Type

type Segment =
  | { readonly _tag: "Literal"; readonly text: string }
  | { readonly _tag: "Any" }
  | { readonly _tag: "Agent" }

export interface Kind {
  readonly name: string
  readonly path: string
  readonly segments: ReadonlyArray<Segment>
  readonly fileName: Option.Option<keyof typeof names>
  readonly write: Write
  readonly required: Readonly<Record<string, Value>>
  readonly optional: Readonly<Record<string, Value>>
}

/** The kinds in the order `registry.yaml` lists them; the first whose pattern matches a path is that path's kind. */
export interface Registry {
  readonly kinds: ReadonlyArray<Kind>
}

export const empty: Registry = { kinds: [] }

const segmentOf = (text: string): Segment =>
  text === "*" ? { _tag: "Any" } : text === "{agent}" ? { _tag: "Agent" } : { _tag: "Literal", text }

/** Reads a kind's pattern, `sops/{agent}/*.md`, into one segment per folder and the file's stem last. */
const compile = (kind: string, spec: typeof KindFile.Type): Result.Result<Kind, string> => {
  const fail = (reason: string) => Result.fail(`Kind \`${kind}\`: ${reason}`)
  const parts = spec.path.split("/")
  const last = parts[parts.length - 1] ?? ""
  if (!last.endsWith(".md")) return fail(`its path \`${spec.path}\` must end in \`.md\`.`)
  const segments = Arr.map([...parts.slice(0, -1), last.slice(0, -3)], segmentOf)
  if (Arr.some(parts, (part) => part === "" || part === "." || part === ".."))
    return fail(`its path \`${spec.path}\` has an empty, \`.\` or \`..\` folder.`)
  if (Arr.some(segments, (segment) => segment._tag === "Literal" && /[*{}]/.test(segment.text)))
    return fail(
      `its path \`${spec.path}\` mixes a wildcard into a name; use \`*\` or \`{agent}\` as a whole folder or name.`
    )
  if (segments.filter((segment) => segment._tag === "Agent").length > 1)
    return fail(`its path \`${spec.path}\` holds \`{agent}\` more than once.`)
  const stem = segments[segments.length - 1]!
  if (stem._tag === "Any" && spec.name === undefined)
    return fail("its file name is a wildcard, so it needs a `name` rule: `kebab`, `date` or `dated`.")
  if (stem._tag !== "Any" && spec.name !== undefined)
    return fail("its file name is fixed by the path, so it takes no `name` rule.")
  const required = spec.required ?? {}
  const optional = spec.optional ?? {}
  if (required["description"] !== "line") return fail("it must require `description: line`, the line the index shows.")
  const both = Object.keys(required).filter((key) => key in optional)
  if (both.length > 0) return fail(`\`${both.join("`, `")}\` is both required and optional.`)
  const owner = required["owner"] ?? optional["owner"]
  if (owner !== undefined && owner !== "agent") return fail("its `owner` property must take an `agent`.")
  if (spec.write === "own" && !segments.some((segment) => segment._tag === "Agent") && required["owner"] !== "agent")
    return fail("`write: own` needs `{agent}` in the path or a required `owner: agent` property.")
  return Result.succeed({
    name: kind,
    path: spec.path,
    segments,
    fileName: Option.fromUndefinedOr(spec.name),
    write: spec.write,
    required,
    optional
  })
}

const decode = Schema.decodeUnknownResult(RegistryFile)

/** Reads `registry.yaml`; the error says what to fix in it. */
export const parse = (content: string): Result.Result<Registry, string> => {
  let raw: unknown
  try {
    raw = Bun.YAML.parse(content)
  } catch (error) {
    return Result.fail(`${file} is not valid YAML: ${error instanceof Error ? error.message : String(error)}`)
  }
  return Result.match(decode(raw), {
    onFailure: (issue) => Result.fail(`${file} does not hold \`kinds\` as documented: ${issue.message}`),
    onSuccess: (registry) => {
      const compiled = Arr.map(Object.entries(registry.kinds), ([kind, spec]) => compile(kind, spec))
      const [kinds, problems] = [Arr.getSuccesses(compiled), Arr.getFailures(compiled)]
      return problems.length > 0 ? Result.fail(`${file}: ${problems.join(" ")}`) : Result.succeed({ kinds })
    }
  })
}

/** Where a path falls in the registry: its kind, and the agent its `{agent}` folder or name names. */
export interface Place {
  readonly kind: Kind
  readonly agent: Option.Option<string>
  readonly stem: string
}

const fits = (kind: Kind, parts: ReadonlyArray<string>): Option.Option<Place> => {
  if (parts.length !== kind.segments.length) return Option.none()
  let agent = Option.none<string>()
  for (const [index, segment] of kind.segments.entries()) {
    const part = parts[index]!
    if (segment._tag === "Literal" && segment.text !== part) return Option.none()
    if (segment._tag === "Agent") agent = Option.some(part)
  }
  return Option.some({ kind, agent, stem: parts[parts.length - 1]! })
}

/** The kind of the first entry whose pattern matches `path`, a path relative to the repository's root. */
export const placeOf = (registry: Registry, path: string): Option.Option<Place> => {
  if (!path.endsWith(".md")) return Option.none()
  const parts = path.slice(0, -3).split("/")
  if (parts.some((part) => part === "" || part.startsWith("."))) return Option.none()
  return Arr.findFirst(registry.kinds, (kind) => fits(kind, parts))
}

const valueProblem = (key: string, value: unknown, expected: Value): Option.Option<string> => {
  const problem = (wanted: string) => Option.some(`\`${key}\` must be ${wanted}.`)
  if (typeof expected !== "string")
    return typeof value === "string" && expected.includes(value)
      ? Option.none()
      : problem(`one of ${expected.map((one) => `\`${one}\``).join(", ")}`)
  switch (expected) {
    case "line":
      return typeof value === "string" && value.trim() !== "" && !value.includes("\n")
        ? Option.none()
        : problem("one line of text")
    case "text":
      return typeof value === "string" ? Option.none() : problem("text")
    case "date":
      return typeof value === "string" && day.test(value) ? Option.none() : problem("a date, `YYYY-MM-DD`")
    case "boolean":
      return typeof value === "boolean" ? Option.none() : problem("`true` or `false`")
    case "list":
      return Array.isArray(value) &&
        value.every((item) => typeof item === "string" && item.trim() !== "" && !item.includes("\n"))
        ? Option.none()
        : problem("a list of one-line items")
    case "agent":
      return typeof value === "string" && slug.test(value) ? Option.none() : problem("an agent's slug")
  }
}

/** Every rule of its kind that a file at `place` with `properties` breaks, each as one sentence. */
export const problemsOf = (place: Place, properties: Readonly<Record<string, unknown>>): ReadonlyArray<string> => {
  const { kind } = place
  const name = Option.match(kind.fileName, {
    onNone: () => [],
    onSome: (rule) =>
      names[rule].pattern.test(place.stem)
        ? []
        : [`The file name \`${place.stem}.md\` must follow \`${rule}\`, such as \`${names[rule].example}.md\`.`]
  })
  const agent = Option.match(place.agent, {
    onNone: () => [],
    onSome: (folder) => (slug.test(folder) ? [] : [`\`${folder}\` is not an agent's slug.`])
  })
  const missing = Object.keys(kind.required)
    .filter((key) => properties[key] === undefined || properties[key] === null || properties[key] === "")
    .map((key) => `\`${key}\` is required.`)
  const allowed = { ...kind.optional, ...kind.required }
  const values = Object.entries(properties).flatMap(([key, value]) => {
    const expected = allowed[key]
    if (expected === undefined)
      return [
        `\`${key}\` is not a property of ${kind.name}; it takes ${Object.keys(allowed)
          .map((one) => `\`${one}\``)
          .join(", ")}.`
      ]
    if (value === undefined || value === null || value === "") return []
    return Option.toArray(valueProblem(key, value, expected))
  })
  return [...name, ...agent, ...missing, ...values]
}

/** The agent a file belongs to: its `{agent}` folder or name, or else its `owner` property. */
export const ownerOf = (place: Place, properties: Readonly<Record<string, unknown>>): Option.Option<string> =>
  Option.orElse(place.agent, () => {
    const owner = properties["owner"]
    return typeof owner === "string" ? Option.some(owner) : Option.none()
  })

/** Whether `agent` may write the file; the owner, acting as no agent, writes every kind. */
export const mayWrite = (place: Place, properties: Readonly<Record<string, unknown>>, agent: Option.Option<string>) =>
  Option.match(agent, {
    onNone: () => true,
    onSome: (acting) => {
      switch (place.kind.write) {
        case "owner":
          return false
        case "agents":
          return true
        case "own":
          return Option.contains(ownerOf(place, properties), acting)
      }
    }
  })

/** Who may write a kind, in a sentence for a refusal. */
export const writers = (place: Place, properties: Readonly<Record<string, unknown>>) => {
  switch (place.kind.write) {
    case "owner":
      return `Only the owner writes ${place.kind.name}.`
    case "agents":
      return `Any agent writes ${place.kind.name}.`
    case "own":
      return Option.match(ownerOf(place, properties), {
        onNone: () => `Only the owner and the agent a ${place.kind.name} belongs to write it.`,
        onSome: (owner) => `Only the owner and ${owner} write this ${place.kind.name}.`
      })
  }
}
