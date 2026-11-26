# The smoke run

The smoke run checks ras on Cloud Run at the service's own `run.app` address, before the domain points at it. It signs in as the owner, writes tasks titled `ras smoke <time> …` and deletes them at the end. It tells instances apart by the `instance` that `/health` answers, which every process picks afresh.

## Before the run

- `bun install` at the repository root.
- The service's address: `gcloud run services describe ras --region europe-west1 --format 'value(status.url)'`.
- The owner's email and password. Set `RAS_SMOKE_URL`, `RAS_SMOKE_EMAIL` and `RAS_SMOKE_PASSWORD`, or pass `--url`, `--email` and `--password`. Without a password the run asks for one.
- For `deploy`: Litestream 0.5 on the `PATH`, and `gcloud auth application-default login`, so `litestream restore` reads the replica bucket.

## A write across an idle stop

```sh
bun run --cwd apps/e2e smoke idle
```

It writes a task, connects an MCP connector and calls `whoami`. Then it sends nothing for `--idle-minutes` (20 by default) and asks `/health` which instance answers. When the same instance answers, it waits again, at most `--attempts` times (3 by default). The uptime check calls `/health` every 15 minutes and wakes the service, so an attempt can meet the same instance. On a new instance it reads the task back with the owner's session from before, and calls `whoami` on the connector's token from before.

It passes when the task is there and the tool answers without a new authorization. It says whether the connector refreshed its token or started a new MCP session on the way. MCP sessions live in the instance's memory, so a new session after a cold start is expected.

## Writes across a deploy, and a restore

```sh
bun run --cwd apps/e2e smoke deploy \
  --deploy "gcloud run deploy ras --region europe-west1 --image <the image to deploy>" \
  --replica gs://<project>-replica/ras
```

It writes a task every second. After 15 seconds of writes it runs the `--deploy` command, waits until another instance answers `/health` (within `--settle-minutes`, 10 by default), and writes 15 seconds more. Every write ras acknowledged must read back. Then `litestream restore` copies the replica into an empty directory, and the copy must hold every acknowledged write. The run counts the writes ras refused during the deploy.

## What the results decide

- `idle` fails with a lost write under request-based billing: Litestream had no CPU to replicate before the stop. The service moves to instance-based billing, and the run repeats.
- `deploy` loses a write, or the restored copy lacks one: two revisions replicated at once. The deploy needs a lease on the replica, or the old revision stops before the new one starts.
- `deploy` passes with refused writes: the deploy had an outage that long, at one write a second.
