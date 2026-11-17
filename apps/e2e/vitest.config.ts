import * as Vitest from "vitest/config"

export default Vitest.defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000
  }
})
