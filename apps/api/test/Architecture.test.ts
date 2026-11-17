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

describe("the architecture", () => {
  it("writes SQL only in a module's Store.ts, its migrations and the audit", () => {
    assert.deepStrictEqual(
      offending(/\b(INSERT|UPDATE|DELETE)\s+(INTO|FROM|\w+\s+SET)\b/, (path) =>
        /\/test\/|\/src\/(Store|Migrations|Writes)\.ts$/.test(path)
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
    const owner = (path: string) => /^packages\/([a-z]+)\/src\//.exec(path)?.[1]
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
})
