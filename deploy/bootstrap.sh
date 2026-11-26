#!/usr/bin/env bash
# Creates the bucket that holds Terraform's state, which Terraform cannot create for itself. Safe to run again.
set -euo pipefail

project="${1:?usage: deploy/bootstrap.sh <project-id>}"
region=europe-west1
bucket="${project}-tfstate"

gcloud services enable storage.googleapis.com --project "$project"

if ! gcloud storage buckets describe "gs://$bucket" --project "$project" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$bucket" \
    --project "$project" \
    --location "$region" \
    --uniform-bucket-level-access \
    --public-access-prevention
fi
gcloud storage buckets update "gs://$bucket" --project "$project" --versioning

echo "Initialise the production root with:"
echo "  terraform -chdir=deploy/production init -backend-config=bucket=$bucket"
