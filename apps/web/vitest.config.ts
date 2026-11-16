import * as Url from "node:url"
import * as Vitest from "vitest/config"

export default Vitest.defineConfig({
  resolve: { alias: { "@": Url.fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.{ts,tsx}"] }
})
