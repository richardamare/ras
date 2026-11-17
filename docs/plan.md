# The plan

ras is the owner's personal system: calendar, tasks on a board, shared memory and mail in one place. Its users are the owner and the owner's agents (Grok bots, Claude, Claude Code and T3 threads, Cursor). Agents reach it through one MCP connector; the owner reaches it through a web console. This document is the design and the order of work: read it whole before building any part, and build the steps in order.

## Shape

| Part                                                                                | Job                                                                                             |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **The API**: one Bun process, a modular monolith over one SQLite file               | Reads the sources, writes intents back, stores what no source holds, serves the two parts below |
| **The connector**: MCP over streamable HTTP at `/mcp`                               | The agents' way in, signed in through OAuth                                                     |
| **The console**: a React app the API serves                                         | The owner's way in, in a browser                                                                |
| **Sources**: Reclaim, Microsoft Graph, iCloud Mail, the memory repository on GitHub | Where outside data lives; each stays the source of truth for its own data                       |

The connector and the console call the same module services, so every rule holds on both. The API runs no model: agents reason, the code computes, enforces and refuses.

**Out of scope**, so nothing of it is built: Jira and booking, Craft and daily notes, finance, the Raycast extension, a config store, a batch endpoint.

## Sources and who writes what

| Data                                                                                                 | Reached through                                               | What ras writes                                                          |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Every calendar, work and personal                                                                    | Reclaim `GET /api/events/v2`, connected to all of them        | Replies to invitations                                                   |
| The calendars of the owner's Outlook account                                                         | Graph, with the owner's Microsoft token                       | Plain events and work blocks: create, change, show-as, cancel            |
| Mail                                                                                                 | iCloud Mail over IMAP, app-specific password                  | Nothing: mailboxes open read-only, messages are fetched with `BODY.PEEK` |
| Memory                                                                                               | A clone of the private GitHub repository `memory` on the host | Facts, as commits pushed to GitHub                                       |
| Spaces, agents, projects, tasks, comments, work blocks, drafts, calendars turned off, audit, sign-in | The SQLite database                                           | Everything; no source holds it                                           |

Reclaim reads every calendar and its Calendar Sync copies events between them. Reclaim's API cannot create a plain event and the work calendar has no Graph access, so every write goes through Graph into a calendar of the owner's Outlook account, and Calendar Sync carries what belongs at work into the work calendar.

## Modules

| Module     | Owns                                                                                                           | Calls                |
| ---------- | -------------------------------------------------------------------------------------------------------------- | -------------------- |
| `global`   | The owner, sign-in and OAuth clients, agents, audit, connections                                               | nothing              |
| `calendar` | Calendars and which are writable, the event cache, the calendar rules, event drafts, Reclaim and Graph clients | `global`             |
| `work`     | Spaces, projects, tasks with their board fields, comments, links, work blocks, block drafts                    | `calendar`, `global` |
| `memory`   | The memory clone, its search index, the GitHub webhook                                                         | `global`             |
| `mail`     | The IMAP client and its reads                                                                                  | `global`             |

Calls run only in the listed directions, so the graph has no cycle. A module reads and writes only its own tables and reaches another module through that module's service. Where `calendar` needs what `work` owns, `calendar` declares the service it needs and `work` provides it, so `calendar` never imports `work`.

## global

- **The owner** is the one person who signs in, with an email and a password through better-auth. Sign-up is closed: `ras owner` creates the one account and sets its password, and refuses a second email.
- **Graph tokens.** Connecting Graph is its own flow, separate from sign-in: the owner connects the Outlook account once, a personal Microsoft account signing in through the consumers tenant, and ras stores its access and refresh tokens with `offline_access` and the calendar scope, sealed with a key from the auth secret. The `calendar` module takes the current token from `global`, refreshing it when it expires, whichever client called. No caller's token is forwarded.
- **The connector's sign-in.** better-auth is the OAuth 2.1 authorization server for `/mcp`, with the MCP plugin, as `dsght` does: dynamic client registration, protected resource metadata, short-lived access tokens bound to the `/mcp` resource, rotating refresh tokens. A client signs in as the owner on a sign-in page and the owner consents once per client on a consent page; the API serves both pages itself, so the connector works before the console exists. Settings lists the connected clients and revokes any of them.
- **An agent** is a named actor the owner's bots act as: a slug (`scheduler`), a display name, active or archived. Agents are tasks' assignees, comments' authors, and the agents memory commits name. Every writing tool takes an optional `agent` argument naming the agent it acts as; an unknown or archived slug is refused. The agent is declared, not proven: every client signs in as the owner.
- **Audit.** Every write appends one entry in the same transaction as the write: action, subject, before and after, the MCP client or the console, the agent if one was named, the time. The table refuses updates and deletes.
- **Connections** report the state of Reclaim, Graph, iCloud Mail and GitHub, and check one on demand.

## calendar

- **Reads** come from Reclaim over every connected calendar, cached in SQLite with each calendar's sync state. A copy Calendar Sync wrote is folded onto its original, so each event shows once.
- **A calendar is writable** when it belongs to the one Outlook account connected through Graph: ras matches the email of the calendar's Reclaim credential to the connected account. Every other calendar is reached only through Reclaim. A calendar turned off takes nothing.
- **The calendar rules** are one pure function with a unit test for every refusal. Plain events are created, changed and cancelled only in a writable calendar. An event of any other calendar takes only a reply to its invitation; any other change is refused with "change it in that calendar's own Outlook". Copies written by Calendar Sync and Reclaim's own events (habits, task blocks) are shown and never written. A refusal states its reason in plain words and what to do instead.
- **Free time and conflicts** run over every enabled calendar in a window. Drafts count as taken: event drafts from `calendar`, block drafts through the busy-time service `work` provides. A conflict lists the fixes the rules allow.
- **Graph writes are idempotent.** Every event create carries a `transactionId`, so a create that timed out but succeeded is not written twice when it is retried.
- **Work hours** of a month come from the calendar, by category, per day and in total.
- **An event draft** lives only in the database until the owner confirms it; confirming writes it through the same path as a new event, and a refused draft stays a draft with the reason. A repeating event cannot be a draft.

## work

### Spaces and projects

A space is where a part of the owner's work belongs: name, colour, order, and the writable calendar its work blocks are written to; any other calendar is refused. Exactly one space is the default and it cannot be archived.

A project is in one space and has a name, a status, a deadline and an optional description. Every block of its tasks lands in its space's calendar. A project moves to another space with its tasks; blocks already written stay in their calendar.

### Tasks and the board

A task has a title, a **body** (Markdown: the brief, written by the owner or by an agent from the owner's dictation), a deadline, a priority, an optional estimate, a project or none, a space (its project's, else the one given, else the default), a **status** and an **assignee**.

- **Status** is `inbox`, `todo`, `in_progress`, `blocked`, `review` or `done`. `inbox` holds work an agent proposed on its own; what the owner asks for starts in `todo`. Moving to `done` closes the task and removes its planned blocks that have not started; leaving `done` reopens it and keeps what was logged.
- **Assignee** is `owner` or an agent. Work assigned to an agent never gets work blocks, so it never counts as the owner's time.
- **Comments** are the task's log, an append-only list: author (`owner` or an agent), time, Markdown text, optional link to an output. Agents write progress, questions and results here and never into the body. Moving a task to `blocked` or `review` takes a comment in the same call, stating what is needed or what to check.
- **Links** attach GitHub issues and pull requests to a task by URL.
- **Deleting** removes a task with its planned blocks, events and drafts only while no work is logged on it; a task with logged work is moved to `done` instead.
- **Time spent** on a task or project is the sum of its ended, confirmed blocks.

### Board notifications

An agent learns about its work by polling: its routine calls `tasks` with its assignee, status `todo` and `updatedSince`. A push to the agent (a signed webhook on assignment) is built once an agent platform is confirmed to start a routine from one.

### Work blocks

A work block is a row and a plain event in its space's calendar, titled with the project and the task, carrying the block's marker in its notes so the calendar opens the task from it. Every change to a block changes its event in the same action; a block the calendar refuses is not saved.

- **Add** a block from a start to an end, or as a draft. The block may lie in the past, in the future or across now. **Start** writes the event from now; **stop** ends it at the real time; one block runs at a time. **Move, resize, remove** a block only through the block, never as a plain event.
- **Blocks may overlap**, each other and any event. Each counts toward its own task's time spent.
- **A block's state follows the clock.** A block with an event is `planned` until its end, then `done`.
- **A block draft** is a block flagged as a draft with no event. A running block is never a draft.
- **Drafts are confirmed together.** `confirm_drafts` writes given drafts, a day's drafts or all of them, events and blocks alike, each through the path a new one takes, and lists the refused ones with the reason. Discarding deletes every draft.

## memory

Memory is the owner's facts, preferences, rules, people, projects, bot specifications and SOPs, shared by every agent. It lives in the private GitHub repository `memory`, so the owner edits it in an IDE and sees each change in `git log`. ras works in the clone at `RAS_MEMORY_PATH`; a clone whose branch has no upstream, as on a development machine, keeps its commits local and pulls nothing.

- **The registry** is `registry.yaml` at the repository's root, and the owner edits it like any other file. It lists the kinds of file memory holds. Each kind has a path pattern, such as `people/*.md` or `sops/{agent}/*.md`, a rule for the file name, its required and optional properties with the values each takes, and who may write it. `*` matches one folder or file name, and `{agent}` matches one too and names the agent the file belongs to.
- **A file's kind is its folder.** A file takes the kind of the first registry entry whose pattern matches its path, so its frontmatter carries no `type`. A file that no pattern matches, or that breaks its kind's rules, is not a fact: it is left out of the index and the search, and `memory_index` and `memory_read` report it with the reason.
- **A fact** is one Markdown file: frontmatter that its kind's rules accept, then the text. Its identity is its path relative to the repository's root, such as `people/jan-novak.md`. Every kind requires `description`, the one line the index shows.
- **Who writes.** A kind is written by the owner only (`owner`), by any agent (`agents`), or by the owner and the agent the file belongs to (`own`). That agent is the `{agent}` folder of the path, or else the file's `owner` property. A write by the owner, with no agent named, passes every kind.
- **Memory holds what no source holds.** Tasks, events and mail are read live from their modules, never copied into memory.
- **Reads** serve from the clone: `memory_index` returns each fact's path, kind and description, filtered by kind or by folder, with the files that are not facts, the registry's kinds and rules, so an agent knows what a write must hold, and the registry's own errors; `memory_read` returns facts by path with each one's version (the file's blob hash); `memory_search` queries an SQLite FTS5 index over the facts.
- **Writes** run one at a time through a queue. `memory_write` takes a path, properties and text; `memory_delete` takes a path and its version. Each pulls with `--ff-only`, changes one file, commits as `memory(<agent>): <path>`, or `memory(owner): <path>` when no agent is named, and pushes. Every commit is the owner's: it carries the owner's git identity configured in the clone, and the agent appears only in the subject. A write is refused, with the reason and what to do instead, when no registry entry matches the path, when the file name or the frontmatter breaks its kind's rules, when an `{agent}` folder or an `owner` property names no agent, or when the acting agent may not write that kind or that file. A rejected push pulls, checks the version again and retries once; a second rejection refuses the write. Changing an existing fact takes the version the caller read; a different version on disk refuses the write with the current text, so an agent never overwrites the owner's edit. A text that matches a secret pattern (tokens, keys, passwords) is refused.
- **Sync.** GitHub's push webhook to `/webhooks/github` (signature checked) makes ras pull, read the registry again and rebuild the index within seconds. A read also pulls when the last pull is older than a minute, so a missed webhook heals itself. A registry that does not parse leaves the last valid one in force, and `memory_index` reports its error until the owner fixes it.
- **Bots' instructions.** Each Grok bot has its specification in `bots/<agent>.md`, which only the owner writes, and its SOPs in `sops/<agent>/<procedure>.md`, which the owner and that bot write.

## mail

iCloud Mail, read-only. `search_mail` finds messages by query; `recent_mail` lists the newest messages of a mailbox; `mail_message` returns one message in full; `mail_attachments` returns its PDF attachments as files.

## The connector

One MCP server at `/mcp`. One tool per outcome, simple arguments, `readOnlyHint` on every read, refusals that say what to do next, every write audited. Tools that write take the optional `agent` argument.

| Module   | Reads                                                                                                        | Writes                                                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| global   | `whoami`, `agents`                                                                                           |                                                                                                                                                                                                            |
| calendar | `list_calendars`, `search_calendar`, `calendar_event`, `find_free_time`, `find_conflicts`, `work_hours`      | `create_event`, `change_event`, `cancel_event`, `reply_to_event`                                                                                                                                           |
| work     | `spaces`, `projects`, `project`, `tasks` (filters: status, assignee, space, project, `updatedSince`), `task` | `add_project`, `update_project`, `add_task`, `update_task`, `delete_task`, `comment_task`, `link_task`, `unlink_task`, `add_work`, `confirm_drafts`, `start_work`, `stop_work`, `move_work`, `remove_work` |
| memory   | `memory_index`, `memory_read`, `memory_search`                                                               | `memory_write`, `memory_delete`                                                                                                                                                                            |
| mail     | `search_mail`, `recent_mail`, `mail_message`, `mail_attachments`                                             |                                                                                                                                                                                                            |

## The console

| Screen       | Holds                                                                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home**     | Counts of open, overdue and in-review tasks; the running block with its stop button; deadlines today, tomorrow and this week; what waits on the owner (`review` and `blocked`)            |
| **Board**    | Columns by status, filtered by assignee, space and project; a card opens the task with its body, comments and links; drag between columns                                                 |
| **Tasks**    | Every task as a table: project, assignee, status, priority, deadline, time spent, next block                                                                                              |
| **Calendar** | Day, week and month over every enabled calendar; drag a task to plan a block; create, move and resize plain events under the calendar rules; drafts with a bar to confirm or discard them |
| **Projects** | Every project with status, deadline, space and progress; a project page with its tasks, time spent and upcoming blocks                                                                    |
| **Settings** | Spaces, agents, calendars, connections, connected MCP clients                                                                                                                             |

## Time

The owner's clock is Europe/Prague. Every tool and screen takes and shows Prague local time; the database stores UTC instants. Reclaim's `GET /api/events/v2` takes Prague days (`start=2026-10-22&end=2026-10-29`) and answers 400 to an instant. Graph gets plain events in `Europe/Prague`, never UTC, so a series keeps its clock across a daylight-saving change. An all-day event is midnight to midnight in Prague. A clock without a date, or a local time that does not exist on that day, is refused before any call leaves the API.

## Code

- **One Bun workspace.** `apps/api` composes the modules and serves HTTP, MCP and the console; `apps/web` is the console. Each module is a package, `packages/<module>`, holding its domain schemas, service, SQL store, migrations, HTTP group and tools. Bun's isolated linker makes an import of an undeclared package fail, so a module's `package.json` dependencies are its allowed calls and the table in Modules is enforced by the build.
- **Effect 4** throughout: services and layers, typed errors, Schema at every boundary, `HttpApi` for HTTP, `effect/ai` `McpServer` and `Toolkit` for the connector. Take the shapes from `dsght` (`apps/api/src/Auth.ts`, `Mcp.ts`, `Tools.ts`).
- **SQLite** through `@effect/sql-sqlite-bun`, one file in WAL mode. Each module runs its own migrations at start and prefixes its tables with its name. better-auth uses the same file through the Effect client: a second `bun:sqlite` connection would block the event loop against an open Effect transaction.
- **One client per outside system** (Reclaim, Graph, IMAP, git) with retries on 429 and 5xx honouring `Retry-After`. The Reclaim client is written by hand against what Reclaim sends; its OpenAPI document fails validation and mistypes events and calendars.
- **Errors**: an outside failure maps to a typed error with a plain reason; HTTP answers it as Problem Details and MCP as a tool error. The transport cause stays in the log.
- **Contract**: `HttpApi` generates `.oas/api.json`, CI fails when it differs from the committed one, and the console's client is generated from it.
- **Sample mode**: each source has an in-memory sample with invented data, chosen by `RAS_SAMPLE`, so tests, the console and the connector run without real accounts.

## Running it

| Piece          | Choice                                                                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host           | The always-on Mac, a launchd agent that restarts on exit                                                                                                                                                        |
| Public address | A Cloudflare Tunnel to the API's port                                                                                                                                                                           |
| Deploy         | `rasctl`, a launchd agent, checks GitHub every two minutes; a newly published release deploys: the host fetches the release's commit into its own folder, starts it, and rolls back when its health check fails |
| Secrets        | 1Password vault `ras`, injected by `op run` at start                                                                                                                                                            |
| Backup         | SQLite `VACUUM INTO` nightly to iCloud (7 kept) and Cloudflare R2 (30 kept); memory is backed up by GitHub                                                                                                      |
| Budget         | Under 150 MB resident at idle on the host                                                                                                                                                                       |

## Steps

Build one step at a time. A step is done when its criterion holds on the running system.

1. **Skeleton.** Workspace and `apps/api`; the module packages with Bun's isolated linker set in `bunfig.toml`; SQLite and migrations; better-auth with the owner's email and password; the sign-in and consent pages; `/mcp` behind OAuth with `whoami`; audit, health, OpenAPI, sample mode. **Done when** Claude Code connects to a local ras through OAuth and `whoami` answers; nobody but the owner can sign in or sign up; and a module importing an undeclared module fails the build.
2. **Memory.** The clone, the registry, the tools, the FTS index, the webhook. **Done when** a fact the owner pushes from the IDE is returned by `memory_read` within a minute, a `memory_write` lands as a commit by its agent on GitHub, a write against a stale version is refused with the current text, a bot's write to another bot's SOP or to its own specification is refused with the reason, and a kind the owner adds to `registry.yaml` from the IDE takes writes after the next pull.
3. **Live.** launchd, tunnel, secrets, backup, deploy from a release. **Done when** a Grok bot and claude.ai are connected to the ras on the host and read memory.
4. **Board.** Agents, spaces, projects, tasks with status, assignee, body, comments and links, their tools and HTTP. **Done when** an agent's poll finds a task assigned to it, the agent moves it to `review` with a comment, and `tasks` returns it to the owner's filter.
5. **Calendar.** Connecting Graph, the Reclaim and Graph clients, the cache, writable calendars, rules, free time, conflicts, event drafts, the tools. **Done when** the owner connects Outlook and, after the Graph access token expires, ras refreshes it; the week across every calendar shows each event once, a show-as change and an all-day event land in a writable calendar, and a weekly series keeps its clock across a daylight-saving change.
6. **Work blocks.** Plan, start, stop, log, move, remove, block drafts, time spent. **Done when** a block planned from a thread lands in its space's calendar, start and stop leave a block with the real times, and the project shows the time spent.
7. **Mail.** The IMAP client and the four tools. **Done when** `recent_mail` lists today's newest messages and nothing on the server is marked read.
8. **Console.** The screens above. **Done when** the owner plans and reviews a week from the board and the calendar without opening Reclaim or Outlook.

## Open

- Whether Grok can start a routine from an incoming webhook; until it can, its agents poll and ras pushes nothing.
- How the host authenticates its pushes to `memory`: a deploy key or a fine-grained token from 1Password.
- Whether the test runner is `bun test` or Vitest under Bun; step 1 picks the one that runs the Effect layers and `bun:sqlite` together.
- The tunnel's domain.
