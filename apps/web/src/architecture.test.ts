import * as Fs from "node:fs"
import * as Path from "node:path"
import * as Url from "node:url"
import * as Vitest from "vitest"

const root = Url.fileURLToPath(new URL(".", import.meta.url))

/** Features lowest first: a feature imports only the features before it, and `shell` composes them all. */
const featureOrder = ["tasks", "calendar", "board", "home", "tasks-table", "projects", "insights", "settings", "shell"]

const sources = (Fs.readdirSync(root, { recursive: true }) as Array<string>)
  .filter((path) => /\.tsx?$/.test(path) && !path.startsWith("lib/api/generated/") && !path.endsWith(".gen.ts"))
  .map((path) => ({ path, text: Fs.readFileSync(Path.join(root, path), "utf8") }))

const imported = (text: string) => Array.from(text.matchAll(/from "@\/([^"]+)"/g), ([, target]) => target!)

/** `components`, `hooks` or `lib`, at the root or in a feature; undefined for routes and the entry files. */
const kindOf = (path: string) => /^(?:features\/[a-z-]+\/)?(components|hooks|lib)\//.exec(path)?.[1]

const featureOf = (path: string) => /^features\/([a-z-]+)\//.exec(path)?.[1]

Vitest.describe("the console's layout", () => {
  Vitest.it("keeps a feature's files in its components, hooks and lib folders", () => {
    Vitest.assert.deepStrictEqual(
      sources.filter(({ path }) => featureOf(path) !== undefined && kindOf(path) === undefined).map(({ path }) => path),
      []
    )
  })

  Vitest.it("names the kind of file by its folder: components render, hooks are use-*.ts, lib is plain .ts", () => {
    const misplaced = sources.filter(({ path }) => {
      const kind = kindOf(path)
      const file = Path.basename(path)
      if (kind === "components") return !file.endsWith(".tsx")
      if (kind === "hooks") return !/^use-[a-z-]+(\.test)?\.ts$/.test(file)
      if (kind === "lib") return !file.endsWith(".ts")
      return false
    })
    Vitest.assert.deepStrictEqual(
      misplaced.map(({ path }) => path),
      []
    )
  })

  Vitest.it("declares every hook in a hooks folder", () => {
    Vitest.assert.deepStrictEqual(
      sources
        .filter(
          ({ path, text }) =>
            kindOf(path) !== "hooks" &&
            !path.startsWith("components/ui/") &&
            /^(export )?(const|function) use[A-Z]/m.test(text)
        )
        .map(({ path }) => path),
      []
    )
  })

  Vitest.it("lets no hook or lib module import a component", () => {
    Vitest.assert.deepStrictEqual(
      sources
        .filter(({ path }) => kindOf(path) === "hooks" || kindOf(path) === "lib")
        .flatMap(({ path, text }) =>
          imported(text)
            .filter((target) => kindOf(target) === "components")
            .map((target) => `${path} -> ${target}`)
        ),
      []
    )
  })

  Vitest.it("keeps the shared folders free of features", () => {
    Vitest.assert.deepStrictEqual(
      sources
        .filter(({ path }) => kindOf(path) !== undefined && featureOf(path) === undefined)
        .flatMap(({ path, text }) =>
          imported(text)
            .filter((target) => featureOf(target) !== undefined)
            .map((target) => `${path} -> ${target}`)
        ),
      []
    )
  })

  Vitest.it("lists every feature in the feature order", () => {
    const features = new Set(Fs.readdirSync(Path.join(root, "features")))
    Vitest.assert.deepStrictEqual(
      [...features].filter((feature) => !featureOrder.includes(feature)),
      []
    )
  })

  Vitest.it("lets a feature import only the features before it", () => {
    Vitest.assert.deepStrictEqual(
      sources.flatMap(({ path, text }) => {
        const feature = featureOf(path)
        if (feature === undefined) return []
        return imported(text)
          .filter((target) => {
            const other = featureOf(target)
            return other !== undefined && featureOrder.indexOf(other) > featureOrder.indexOf(feature)
          })
          .map((target) => `${path} -> ${target}`)
      }),
      []
    )
  })
})
