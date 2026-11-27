#!/usr/bin/env bash
# Applies the production root. A plan that updates the Cloud Run service rolls a new revision, and two revisions
# replicating at once lose writes, so the old instance stops and flushes before that apply, as in the deploy workflow.
# The service scales back up even when the apply fails.
set -euo pipefail

project="${1:?usage: deploy/apply.sh <project-id>}"
root="$(cd "$(dirname "$0")" && pwd)/envs/prod"
service=(ras --region europe-west1 --project "$project" --quiet)

plan=$(mktemp)
trap 'rm -f "$plan"' EXIT
terraform -chdir="$root" plan -input=false -out="$plan"

if ! terraform -chdir="$root" show -json "$plan" | jq -e '
  any(.resource_changes[]?; .address == "module.service.google_cloud_run_v2_service.this" and .change.actions == ["update"])
' >/dev/null; then
  terraform -chdir="$root" apply -input=false "$plan"
  exit
fi

trap 'gcloud run services update "${service[@]}" --scaling=auto; rm -f "$plan"' EXIT
gcloud run services update "${service[@]}" --scaling=0
terraform -chdir="$root" apply -input=false "$plan"
