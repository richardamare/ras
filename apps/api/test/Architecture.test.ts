import * as Fs from "node:fs"
import { assert, describe, it } from "@effect/vitest"
import * as Arr from "effect/Array"
import * as Result from "effect/Result"

const root = new URL("../../../", import.meta.url).pathname

const sources = Arr.map(
  Arr.filter(
    Arr.fromIterable(new Bun.Glob("{apps,packages}/*/{src,test}/**/*.{ts,tsx}").scanSync({ cwd: root })),
    (path) => !path.endsWith(".gen.ts")
  ),
  (path) => ({ path, text: Fs.readFileSync(root + path, "utf8") })
)

const offending = (rule: RegExp, allowed: (path: string) => boolean) =>
  Arr.filter(sources, (file) => !allowed(file.path) && rule.test(file.text)).map((file) => file.path)

const owner = (path: string) => /^packages\/([a-z]+)\/src\//.exec(path)?.[1]

/**
 * Each module's feature folders, lowest first. A folder imports only the folders before it, so the folders of a module
 * never form a cycle, and none imports the module's root files, which compose the folders.
 */
const folderOrder: Readonly<Record<string, ReadonlyArray<string>>> = {
  global: ["audit", "agents", "auth", "oauth", "graph", "google"],
  calendar: ["model", "reclaim", "google", "outlook", "calendars", "events"],
  work: ["tasks", "blocks", "board", "drafts"],
  mail: ["mailbox"],
  memory: ["clone", "registry", "facts", "webhook"]
}

const folderOf = (path: string) => /^packages\/([a-z]+)\/src\/(?:([a-z]+)\/)?/.exec(path)

describe("the architecture", () => {
  it("writes SQL only in a module's repositories, its migrations and the audit", () => {
    assert.deepStrictEqual(
      offending(/\b(INSERT|UPDATE|DELETE)\s+(INTO|FROM|\w+\s+SET)\b/, (path) =>
        /\/test\/|\/[A-Z][A-Za-z]*Repository\.ts$|\/Migrations\.ts$|^packages\/global\/src\/(.+\/)?Writes\.ts$/.test(
          path
        )
      ),
      []
    )
  })

  it("lets only repositories reach the SQL client", () => {
    assert.deepStrictEqual(
      offending(
        /from "effect\/sql\//,
        (path) =>
          !/^packages\/[a-z]+\/src\//.test(path) ||
          path.startsWith("packages/kernel/src/") ||
          /\/([A-Z][A-Za-z]*Repository|Migrations|Writes|AuthDatabase|Testing)\.ts$/.test(path)
      ),
      []
    )
  })

  it("maps every repository row through one local to-function", () => {
    const repositories = Arr.filter(sources, (file) =>
      /^packages\/[a-z]+\/src\/(.+\/)?[A-Z]\w*Repository\.ts$/.test(file.path)
    )
    const offences = Arr.flatMap(repositories, (file) =>
      Arr.dedupe(
        Arr.filterMap(Arr.fromIterable(file.text.matchAll(/\(row(\)|:)/g)), (found) => {
          const before = file.text.slice(0, found.index)
          const statement = before.slice(
            Math.max(0, ...Arr.map(Arr.fromIterable(before.matchAll(/\n(?=\S)/g)), (line) => line.index + 1))
          )
          return /^const to[A-Z]\w* =\s*(\([^()]*\)\s*=>\s*)?\(row: \w+Row\)/.test(
            statement + file.text.slice(found.index)
          )
            ? Result.failVoid
            : Result.succeed(`${file.path}:${before.split("\n").length}`)
        })
      )
    )
    assert.deepStrictEqual(offences, [])
  })

  it("keeps each module's code in feature folders", () => {
    const folders = new Set(
      Arr.filterMap(sources, (file) =>
        Result.fromNullishOr(/^(packages\/[a-z]+\/src\/[a-z]+)\//.exec(file.path)?.[1], () => undefined)
      )
    )
    assert.deepStrictEqual(
      Arr.filter(sources, ({ path }) => {
        const source = /^packages\/(?!kernel\/)[a-z]+\/src\/(.+)$/.exec(path)?.[1]
        if (source !== undefined)
          return !/^(index|Module|Testing|Migrations|Http|Tools)\.ts$|^[a-z]+\/[A-Z][A-Za-z]*\.ts$/.test(source)
        const test = /^(packages\/(?!kernel\/)[a-z]+)\/test\/([a-z]+)\//.exec(path)
        return test !== null && !folders.has(`${test[1]}/src/${test[2]}`)
      }).map((file) => file.path),
      []
    )
  })

  it("names each schema file after what it holds", () => {
    assert.deepStrictEqual(
      Arr.filter(sources, (file) => /^packages\/[a-z]+\/src\/(.+\/)?Domain\.ts$/.test(file.path)).map(
        (file) => file.path
      ),
      []
    )
  })

  it("lets only apps/api import a module's descriptor", () => {
    assert.deepStrictEqual(
      offending(/from "@ras\/\w+\/module"/, (path) => path.startsWith("apps/api/")),
      []
    )
  })

  it("imports every module as a namespace", () => {
    assert.deepStrictEqual(
      offending(/^import (type )?\{(?![^}]*\}\s*from "@effect\/vitest")/m, () => false),
      []
    )
  })

  it("lets a module's SQL name only its own tables", () => {
    const modules = new Set(
      Arr.filterMap(sources, (file) =>
        /^packages\/[a-z]+\/src\/Module\.ts$/.test(file.path)
          ? Result.fromNullishOr(owner(file.path), () => undefined)
          : Result.failVoid
      )
    )
    const offences = Arr.flatMap(sources, (file) => {
      const module = owner(file.path)
      if (module === undefined) return []
      return Arr.filterMap(
        Arr.fromIterable(file.text.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+(([a-z]+)_[a-z_]+)/g)),
        ([, table, prefix]) =>
          modules.has(prefix!) && prefix !== module ? Result.succeed(`${file.path}: ${table}`) : Result.failVoid
      )
    })
    assert.deepStrictEqual(offences, [])
  })

  it("lists every feature folder of a module in its folder order", () => {
    const folders = Arr.dedupe(
      Arr.filterMap(sources, (file) => {
        const found = folderOf(file.path)
        return found === null || found[1] === "kernel" || found[2] === undefined
          ? Result.failVoid
          : Result.succeed(`${found[1]}/${found[2]}`)
      })
    )
    assert.deepStrictEqual(
      Arr.filter(folders, (folder) => {
        const [module, name] = folder.split("/") as [string, string]
        return !(folderOrder[module] ?? []).includes(name)
      }),
      []
    )
  })

  it("lets a feature folder import only the folders before it in its module", () => {
    const offences = Arr.flatMap(sources, (file) => {
      const found = folderOf(file.path)
      if (found === null || found[2] === undefined) return []
      const order = folderOrder[found[1]!] ?? []
      const rank = order.indexOf(found[2])
      return Arr.filterMap(Arr.fromIterable(file.text.matchAll(/from "(\.\.?\/[^"]+)"/g)), ([, specifier]) => {
        const target = new URL(specifier!, `file:///${file.path}`).pathname.slice(1)
        const reached = folderOf(target)
        if (reached === null || reached[2] === found[2]) return Result.failVoid
        return reached[2] === undefined || order.indexOf(reached[2]) > rank
          ? Result.succeed(`${file.path} -> ${target}`)
          : Result.failVoid
      })
    })
    assert.deepStrictEqual(offences, [])
  })
})
