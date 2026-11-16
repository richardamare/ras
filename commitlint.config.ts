import type { UserConfig } from "@commitlint/types"

const config: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [2, "always", ["ci", "deps", "deps-dev", "docs", "release", "repo"]]
  }
}

export default config
