#!/usr/bin/env bash
# Adds a value to each secret Terraform created without one. Asks for each value without echoing it; an empty answer
# leaves that secret as it is. The memory deploy key is read from its private key file.
# Run it after `terraform apply -target=module.secrets` and before the full apply: the service's first revision reads
# every secret and fails to start while one has no value.
set -euo pipefail

project="${1:?usage: deploy/seed-secrets.sh <project-id>}"

secrets=(
  auth-secret
  memory-webhook-secret
  reclaim-api-key
  graph-client-secret
  google-client-secret
  mail-app-password
)

add() {
  gcloud secrets versions add "$1" --project "$project" --data-file=- >/dev/null
  echo "$1: added"
}

for secret in "${secrets[@]}"; do
  gcloud secrets describe "$secret" --project "$project" >/dev/null
  read -rsp "$secret: " value
  echo
  if [[ -n "$value" ]]; then printf '%s' "$value" | add "$secret"; fi
done

gcloud secrets describe memory-deploy-key --project "$project" >/dev/null
read -rp "Private key file of the memory deploy key: " key
if [[ -n "$key" ]]; then add memory-deploy-key < "${key/#\~/$HOME}"; fi
