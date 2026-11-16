---
title: Compose module packages from one typed list
status: proposed
date: 2026-11-16
---

# 1. Compose module packages from one typed list

## Context

ras is five modules in one Bun process over one SQLite file, reached over HTTP and MCP. The next contributor is usually an agent that copies the nearest example, so the module boundaries, the write audit and the wiring of every module into both transports have to hold without anyone remembering them.

## Decision

Each module is a workspace package, `packages/<module>`, whose `dependencies` are the modules it may call. It exports `.` for other modules and `./module` for `apps/api`, and nothing else is reachable. `./module` holds one descriptor made with `Module.make`: name, migrations, services, ports, HTTP group and handlers, toolkit and handlers, raw routes. `apps/api/src/Modules.ts` lists the descriptors once, each after the modules it calls. The HTTP API, its OpenAPI document, the MCP toolkit, the migrations and the service layers are all derived from that list, and the compiler rejects a list in the wrong order.

A module that needs data another module owns declares a port, a service in its own package. The owning module provides it in its descriptor's `ports` slot, which is built before every module's services, so calendar counts work's block drafts as busy without importing work.

Every write goes through `Writes.run` in `global`. It runs the write in one SQLite transaction and appends the audit entry with the current actor before the commit. A store statement marked with `write` requires a `Transaction` value that only `Writes.run` can make, and a test fails on SQL writes outside `Store.ts`.

`packages/kernel` holds the shared vocabulary: the descriptor, the error classes, ids and Prague time. It depends on `effect` alone and holds no table, no stateful service and no outside system.

## Consequences

- Bun's isolated linker and each package's `exports` make an undeclared or internal import fail in `tsc` and at runtime, with no custom lint rule.
- Adding a module is one package and one line in `Modules.ts`. A test fails when a package on disk is missing from the list.
- The composition carries a type-level fold and one cast in `kernel/Module.ts`, covered by a `.types.ts` test.
- better-auth reaches SQLite through the Effect client, because a second `bun:sqlite` connection to the same file blocks against it. Its multi-statement flows run without a transaction, and it must not be called inside `Writes.run`.
- Calls to outside systems (Graph, git) run before `Writes.run`, so the write lock is held only for the statements.
