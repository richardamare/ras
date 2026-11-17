---
title: Group each package into feature folders
status: proposed
date: 2026-11-17
---

# 3. Group each package into feature folders

## Context

Each module package kept its files flat in `src/`, and calendar, work and mail kept all of their schemas in one `Domain.ts`. A file name did not say which feature a file belongs to. The next contributor is usually an agent that copies the nearest example, so the layout has to tell it where a new file goes.

## Decision

The root of a module's `src/` holds only `index.ts`, `Module.ts`, `Testing.ts`, `Migrations.ts`, `Http.ts` and `Tools.ts`: the entry points and the files with one instance per module. Every other file sits in a lowercase feature folder one level deep, such as `work/src/board/`. The folder holds the feature's service, repositories, schemas, helpers and outside clients.

A schema file is named after what it holds, in the singular, beside the plural service file: `Agent.ts` and `Agents.ts`, `Calendar.ts` and `Calendars.ts`. No `Domain.ts` remains. Tests mirror the folders: `test/<feature>/` sits beside `src/<feature>/`. `packages/kernel` exports file by file and stays flat.

## Consequences

- A feature may import another feature's schema or repository directly. There is no `index.ts` per folder.
- Schema files must not import each other in a cycle. A cycle fails at load time with a schema that is `undefined`. A schema that two files need, such as `ProjectDetail`, gets its own file.
- `apps/api/test/Architecture.test.ts` fails on a file outside the layout, on a test folder with no matching source folder, and on any `Domain.ts`.
- A new file with one instance per module joins the allowed root list in the same change.
