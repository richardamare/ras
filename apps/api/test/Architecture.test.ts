import * as Fs from "node:fs"
import { assert, describe, it } from "@effect/vitest"
import * as Arr from "effect/Array"

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
})
