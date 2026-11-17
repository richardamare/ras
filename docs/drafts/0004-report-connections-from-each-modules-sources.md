---
title: Report connections from the sources each module declares
status: proposed
date: 2026-11-17
---

# 4. Report connections from the sources each module declares

## Context

Settings has to show whether Outlook, Reclaim, iCloud Mail and GitHub work, and check one on demand. `global` owns connections, but each system is reached by another module: Outlook and Reclaim by `calendar`, iCloud by `mail`, the memory repository by `memory`. `global` sits first in the module list and may call none of them.

## Decision

`packages/kernel/Connections.ts` defines a connection (kind, state, detail) and a source: its state read from its settings, and a check that reaches it with the cheapest read. `Connections.source` adds the shared rules: sample mode answers `sample` and reaches nothing, a source without its settings is never reached, and a failed read turns `connected` into `failing` with its reason.

The module descriptor gains a `connections` slot. Each module lists the sources it reaches, built from its own services. `Module.services` builds them after every module's services and provides one `Connections` service over all of them, in a fixed order. `global` serves `GET /global/connections` and `POST /global/connections/:kind/check` from that service without importing any module.

## Consequences

- A new outside system is one source in the module that reaches it, plus a kind in the kernel.
- Listing reads only settings and the database, so Settings opens without waiting on any outside system. Only a check reaches it.
- Each check is a real read: one Graph calendar, Reclaim's calendar list, one iCloud Inbox message, and `git ls-remote` against the memory upstream.
- The kernel now knows the names of the four outside systems, as a closed list the API and the console share.
- The memory module builds its clone a second time for its source, since its services keep the clone private.
