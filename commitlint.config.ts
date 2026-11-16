import type { UserConfig } from "@commitlint/types"

const config: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "api",
        "calendar",
        "ci",
        "deps",
        "deps-dev",
        "docs",
        "global",
        "kernel",
        "mail",
        "memory",
        "release",
        "repo",
        "web",
        "work"
      ]
    ]
  }
}

export default config
