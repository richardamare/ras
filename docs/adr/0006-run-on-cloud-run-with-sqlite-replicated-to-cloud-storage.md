---
title: Run on Cloud Run with SQLite replicated to Cloud Storage
status: accepted
date: 2026-11-26
---

# 6. Run on Cloud Run with SQLite replicated to Cloud Storage

## Context

ras runs on one Mac at home and stops whenever that Mac sleeps, restarts or loses its network. Its deploys, secrets and address hang on tools set up by hand on that machine, and nothing records that setup. The owner wants ras in Google Cloud, described in the repository, at no cost beyond the free tier.

## Decision

ras runs as one Cloud Run service in `europe-west1` with request-based billing, at most one instance and none while idle. The database stays a SQLite file on the instance's disk. At start, Litestream restores it from the replica in a Cloud Storage bucket. `ras serve` then runs under `litestream replicate -exec`, which sends every write to that bucket. The bucket keeps object versions and soft-deleted objects.

The entrypoint clones the memory repository with a deploy key that can write to that repository alone, so memory works on a disk that does not last. Secrets live in Secret Manager and reach the container as environment variables. Terraform in `deploy/` describes the whole project, with its state in a bucket a bootstrap script creates. Terraform creates each secret without a version, and a seed script on the owner's machine adds the values, so the state holds none. A `v*` tag builds the image, pushes it to Artifact Registry and deploys it from GitHub Actions through Workload Identity Federation. Terraform ignores the service's image, which the deploy workflow owns.

## Consequences

- The schema, the migrations and the queries stay as they are, FTS5 memory search included.
- Only one instance may write, so the service runs at most one. A deploy scales the service to no instances before it rolls the new revision, because two revisions replicating at once lose writes. ras refuses requests for about 40 seconds of each deploy.
- Litestream sends the last writes before an idle stop under request-based billing, as the smoke run shows.
- A cold start restores the database and clones memory before ras answers, so the first request after an idle stop is slower.
- The owner applies Terraform from their own machine, and CI only checks it.
- The owner gets an email when the month's bill passes 120 CZK or `/health` stops answering.
