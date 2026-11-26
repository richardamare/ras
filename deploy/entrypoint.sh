#!/bin/sh
set -eu

: "${RAS_REPLICA_BUCKET:?names the bucket holding the replica}"
: "${RAS_MEMORY_REPOSITORY:?names the memory repository to clone}"
: "${RAS_MEMORY_DEPLOY_KEY:?holds the deploy key of the memory repository}"

litestream restore -if-replica-exists -if-db-not-exists "$RAS_DATABASE"

key="$HOME/.ssh/memory"
mkdir -p -m 700 "$HOME/.ssh"
printf '%s\n' "$RAS_MEMORY_DEPLOY_KEY" > "$key"
chmod 600 "$key"
unset RAS_MEMORY_DEPLOY_KEY

if [ ! -d "$RAS_MEMORY_PATH/.git" ]; then
  git clone --quiet \
    -c core.sshCommand="ssh -i $key -o IdentitiesOnly=yes" \
    -c user.name=ras \
    -c user.email=ras@localhost \
    "$RAS_MEMORY_REPOSITORY" "$RAS_MEMORY_PATH"
fi

cd /app/apps/api
exec litestream replicate -exec "bun src/main.ts serve"
