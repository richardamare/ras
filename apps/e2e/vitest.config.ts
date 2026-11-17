import * as Vitest from "vitest/config"

export default Vitest.defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/setup.ts"],
    // The files share one ras, whose running block and block times are global, so they run one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000
  }
})
