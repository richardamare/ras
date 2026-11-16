#!/usr/bin/env bash
set -euo pipefail

release="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

exec bun "$release/apps/ctl/src/main.ts" serve
