#!/usr/bin/env bash
set -euo pipefail

# -P resolves the current link, so a later deploy leaves this start on its own release.
release="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
state="$HOME/Library/Application Support/ras"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

OP_SERVICE_ACCOUNT_TOKEN="$(security find-generic-password -s ras-op-token -w)"
export OP_SERVICE_ACCOUNT_TOKEN

export RAS_PORT=5180
export RAS_DATABASE="$state/ras.db"
export RAS_MEMORY_PATH="$state/memory"
export RAS_BACKUP_ICLOUD="$HOME/Library/Mobile Documents/com~apple~CloudDocs/ras-backups"

cd "$release/apps/api"
exec op run --env-file "$release/deploy/ras.env" -- bun src/main.ts serve
