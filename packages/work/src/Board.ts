import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Calendar from "@ras/calendar"
import * as Global from "@ras/global"
import * as Errors from "@ras/kernel/Errors"
import * as Id from "@ras/kernel/Id"
import * as Time from "@ras/kernel/Time"
import * as Blocks from "./Blocks.ts"
import * as Domain from "./Domain.ts"
import * as BlockRepository from "./BlockRepository.ts"
import * as ProjectRepository from "./ProjectRepository.ts"
import * as SpaceRepository from "./SpaceRepository.ts"
import * as TaskRepository from "./TaskRepository.ts"

type Read<A> = Effect.Effect<A, Errors.NotFound | Errors.Invalid>

const now = Effect.map(DateTime.now, DateTime.formatIso)

const refuse = (code: string, reason: string, instead?: string) =>
  Effect.fail(new Errors.Refused({ code, reason, ...(instead === undefined ? {} : { instead }) }))

/** Who the current call speaks for: the agent it named, or the owner. */
const speaker = Effect.map(Effect.service(Global.CurrentActor), (actor): Domain.Person =>
  Option.getOrElse(actor.agent, () => "owner" as const)
)

const columns = (summary: Domain.TaskSummary, body: string): TaskRepository.TaskColumns => ({
  title: summary.title,
  body,
  status: summary.status,
  assignee: summary.assignee,
  priority: summary.priority,
  deadline: summary.deadline,
  estimate: summary.estimate,
  project: summary.project,
  space: summary.space
})

export class Board extends Context.Service<
  Board,
  {
    readonly spaces: Effect.Effect<ReadonlyArray<Domain.Space>>
    readonly addSpace: (space: typeof Domain.NewSpace.Type) => Global.Write<Domain.Space>
    readonly changeSpace: (id: Domain.SpaceId, change: typeof Domain.SpaceChange.Type) => Global.Write<Domain.Space>
    readonly archiveSpace: (id: Domain.SpaceId) => Global.Write<Domain.Space>
    readonly projects: (space: Option.Option<Domain.SpaceId>) => Effect.Effect<ReadonlyArray<Domain.Project>>
    readonly project: (id: Domain.ProjectId) => Read<Domain.ProjectDetail>
    readonly addProject: (project: Domain.NewProject) => Global.Write<Domain.Project>
    readonly changeProject: (id: Domain.ProjectId, change: Domain.ProjectChange) => Global.Write<Domain.Project>
    readonly tasks: (filter: Domain.TaskFilter) => Read<ReadonlyArray<Domain.TaskSummary>>
    readonly task: (id: Domain.TaskId) => Read<Domain.Task>
    readonly addTask: (task: Domain.NewTask) => Global.Write<Domain.Task>
    readonly changeTask: (id: Domain.TaskId, change: Domain.TaskChange) => Global.Write<Domain.Task>
    /** Deletes a task with its blocks; a task with work begun on it is moved to done instead, and answered. */
    readonly deleteTask: (id: Domain.TaskId) => Global.Write<Option.Option<Domain.Task>>
    readonly comment: (id: Domain.TaskId, comment: Domain.NewComment) => Global.Write<Domain.Task>
    readonly link: (id: Domain.TaskId, url: string) => Global.Write<Domain.Task>
    readonly unlink: (id: Domain.TaskId, url: string) => Global.Write<Domain.Task>
  }
>()("@ras/work/Board") {
  static readonly layer = Layer.effect(
    Board,
    Effect.gen(function* () {
      const spaces = yield* SpaceRepository.SpaceRepository
      const projects = yield* ProjectRepository.ProjectRepository
      const tasks = yield* TaskRepository.TaskRepository
      const storedBlocks = yield* BlockRepository.BlockRepository
      const writes = yield* Global.Writes
      const agents = yield* Global.Agents
      const calendar = yield* Calendar.Calendar
      const blocks = yield* Blocks.Blocks

      const space = (id: string) => spaces.byId(id).pipe(Effect.flatMap(Errors.orNotFound("space", id)))
      const project = (id: string) => projects.byId(id).pipe(Effect.flatMap(Errors.orNotFound("project", id)))
      const stored = (id: string) => tasks.byId(id).pipe(Effect.flatMap(Errors.orNotFound("task", id)))

      const task = (id: Domain.TaskId) =>
        Effect.gen(function* () {
          const { summary, body } = yield* stored(id)
          return new Domain.Task({
            ...summary,
            spent: Blocks.spent(yield* storedBlocks.ofTask(id), yield* DateTime.now),
            body,
            comments: yield* tasks.comments(id),
            links: yield* tasks.links(id)
          })
        })

      /** A space work can go into: it exists and is not archived. */
      const open = (id: string) =>
        Effect.flatMap(space(id), (found) =>
          found.archived
            ? refuse("work.space.archived", `The space ${found.name} is archived.`, "Put the work in another space.")
            : Effect.succeed(found)
        )

      /** A calendar work blocks can go to: connected, on, and writable. */
      const personal = (id: Calendar.CalendarId) =>
        Effect.gen(function* () {
          const found = (yield* calendar.calendars(true)).find((entry) => entry.id === id)
          if (found === undefined) return yield* new Errors.NotFound({ subject: "calendar", id: String(id) })
          if (!found.writable || !found.enabled)
            return yield* refuse(
              "work.space.calendar",
              `"${found.name}" is ${found.enabled ? "not in the Outlook account connected to ras" : "turned off"}, and work blocks go only to a calendar ras writes.`,
              "Choose a calendar of the connected Outlook account that is on."
            )
          return found
        })

      const assignable = (person: Domain.Person) =>
        person === "owner" ? Effect.void : Effect.asVoid(agents.active(person))

      const run = <A, E, R>(
        action: Global.Action,
        subject: string,
        before: Option.Option<object>,
        body: Effect.Effect<A, E, R>,
        after: (result: A) => Option.Option<object>
      ) =>
        writes.run(
          action,
          Effect.map(body, (result) => ({
            result,
            subject,
            before: before as Option.Option<Global.Snapshot>,
            after: after(result) as Option.Option<Global.Snapshot>
          }))
        )

      const changeTask = (id: Domain.TaskId, change: Domain.TaskChange) =>
        Effect.gen(function* () {
          const author = yield* speaker
          const { summary, body } = yield* stored(id)
          if (change.body !== undefined && change.body !== body && author !== "owner") {
            return yield* refuse(
              "work.task.body",
              "The task's body is the owner's brief, so an agent does not change it.",
              "Write progress, questions and results with comment_task, or in `comment`."
            )
          }
          const status = change.status ?? summary.status
          if (status !== summary.status && Domain.explained.includes(status) && change.comment === undefined) {
            return yield* refuse(
              "work.task.comment",
              `A move to ${status} needs a comment in the same call.`,
              status === "blocked" ? "Say in `comment` what is needed." : "Say in `comment` what to check."
            )
          }
          if (change.assignee !== undefined) yield* assignable(change.assignee)
          const inProject =
            change.project === undefined
              ? Option.none<Domain.Project>()
              : change.project === null
                ? Option.none<Domain.Project>()
                : Option.some(yield* project(change.project))
          const home = Option.isSome(inProject)
            ? inProject.value.space
            : change.space === undefined
              ? summary.space
              : (yield* open(change.space)).id
          const at = yield* now
          const after: TaskRepository.TaskColumns = {
            title: change.title ?? summary.title,
            body: change.body ?? body,
            status,
            assignee: change.assignee ?? summary.assignee,
            priority: change.priority ?? summary.priority,
            deadline: change.deadline === undefined ? summary.deadline : change.deadline,
            estimate: change.estimate === undefined ? summary.estimate : change.estimate,
            project: change.project === undefined ? summary.project : change.project,
            space: home
          }
          if (status === "done" && summary.status !== "done") yield* blocks.release(id)
          const diff = Global.changed(columns(summary, body), after)
          const write = Effect.gen(function* () {
            yield* tasks.update(id, after, at)
            if (change.comment !== undefined) {
              const comment = { id: yield* Id.generate(Domain.CommentId), author, at, text: change.comment }
              yield* tasks.addComment(id, comment)
            }
          })
          yield* run(
            status !== summary.status ? `work.task.${status === "done" ? "closed" : "moved"}` : "work.task.changed",
            `task/${id}`,
            Option.some(diff.before),
            write,
            () => Option.some(change.comment === undefined ? diff.after : { ...diff.after, comment: change.comment })
          )
          return yield* task(id)
        })

      return Board.of({
        spaces: spaces.all,

        addSpace: (input) =>
          Effect.gen(function* () {
            const position = (yield* spaces.all).length
            const added = new Domain.Space({
              id: yield* Id.generate(Domain.SpaceId),
              name: input.name,
              color: input.color,
              position,
              calendar: null,
              default: false,
              archived: false
            })
            return yield* run(
              "work.space.added",
              `space/${added.id}`,
              Option.none(),
              Effect.as(spaces.insert(added), added),
              (result) => Option.some(Global.snapshot(Domain.Space, result))
            )
          }),

        changeSpace: (id, change) =>
          Effect.gen(function* () {
            const before = yield* space(id)
            if (change.default === true && before.archived) {
              return yield* refuse(
                "work.space.archived",
                `The space ${before.name} is archived, so it cannot be the default.`
              )
            }
            if (change.calendar !== undefined && change.calendar !== null) yield* personal(change.calendar)
            const after = new Domain.Space({ ...before, ...change, default: change.default ?? before.default })
            const diff = Global.changed(Global.snapshot(Domain.Space, before), Global.snapshot(Domain.Space, after))
            return yield* run(
              "work.space.changed",
              `space/${id}`,
              Option.some(diff.before),
              Effect.as(spaces.update(after), after),
              () => Option.some(diff.after)
            )
          }),

        archiveSpace: (id) =>
          Effect.gen(function* () {
            const before = yield* space(id)
            if (before.default) {
              return yield* refuse(
                "work.space.default",
                `${before.name} is the default space, which cannot be archived.`,
                "Make another space the default first."
              )
            }
            if (before.archived) return before
            const after = new Domain.Space({ ...before, archived: true })
            return yield* run(
              "work.space.archived",
              `space/${id}`,
              Option.some({ archived: false }),
              Effect.as(spaces.archive(id, yield* now), after),
              () => Option.some({ archived: true })
            )
          }),

        projects: (inSpace) => projects.list({ space: inSpace }),

        project: (id) =>
          Effect.gen(function* () {
            const found = yield* project(id)
            return new Domain.ProjectDetail({
              ...found,
              spent: Blocks.spent(yield* storedBlocks.ofProject(id), yield* DateTime.now),
              tasks: yield* tasks.list({ project: id })
            })
          }),

        addProject: (input) =>
          Effect.gen(function* () {
            const home = input.space === undefined ? yield* spaces.defaultSpace : yield* open(input.space)
            const added = new Domain.Project({
              id: yield* Id.generate(Domain.ProjectId),
              space: home.id,
              name: input.name,
              status: input.status ?? "active",
              deadline: input.deadline ?? null,
              description: input.description ?? null
            })
            return yield* run(
              "work.project.added",
              `project/${added.id}`,
              Option.none(),
              Effect.as(projects.insert(added), added),
              (result) => Option.some(Global.snapshot(Domain.Project, result))
            )
          }),

        changeProject: (id, change) =>
          Effect.gen(function* () {
            const before = yield* project(id)
            if (change.space !== undefined && change.space !== before.space) yield* open(change.space)
            const after = new Domain.Project({ ...before, ...change })
            const diff = Global.changed(Global.snapshot(Domain.Project, before), Global.snapshot(Domain.Project, after))
            return yield* run(
              "work.project.changed",
              `project/${id}`,
              Option.some(diff.before),
              Effect.as(projects.update(after), after),
              () => Option.some(diff.after)
            )
          }),

        tasks: (filter) =>
          Effect.gen(function* () {
            const { updatedSince, ...rest } = filter
            if (updatedSince === undefined) return yield* tasks.list(rest)
            const since = DateTime.formatIso(yield* Time.toInstant(updatedSince))
            return yield* tasks.list({ ...rest, updatedSince: since })
          }),

        task,

        addTask: (input) =>
          Effect.gen(function* () {
            const author = yield* speaker
            const inProject = input.project === undefined ? Option.none() : Option.some(yield* project(input.project))
            const home = yield* Option.match(inProject, {
              onSome: (found) => open(found.space),
              onNone: () => (input.space === undefined ? spaces.defaultSpace : open(input.space))
            })
            const assignee = input.assignee ?? "owner"
            yield* assignable(assignee)
            const at = yield* now
            const status = input.status ?? (author === "owner" ? "todo" : "inbox")
            const id = yield* Id.generate(Domain.TaskId)
            const row: TaskRepository.TaskColumns = {
              title: input.title,
              body: input.body ?? "",
              status,
              assignee,
              priority: input.priority ?? "normal",
              deadline: input.deadline ?? null,
              estimate: input.estimate ?? null,
              project: Option.match(inProject, { onNone: () => null, onSome: (found) => found.id }),
              space: home.id
            }
            yield* run("work.task.added", `task/${id}`, Option.none(), tasks.insert(id, row, at), () =>
              Option.some(row)
            )
            return yield* task(id)
          }),

        changeTask,

        deleteTask: (id) =>
          Effect.gen(function* () {
            const { summary, body } = yield* stored(id)
            const now = yield* DateTime.now
            if ((yield* storedBlocks.ofTask(id)).some((row) => Blocks.started(row, now)))
              return Option.some(yield* changeTask(id, { status: "done" }))
            yield* blocks.release(id)
            yield* run(
              "work.task.deleted",
              `task/${id}`,
              Option.some({ ...Global.snapshot(Domain.TaskSummary, summary), body }),
              tasks.delete(id),
              () => Option.none()
            )
            return Option.none()
          }),

        comment: (id, input) =>
          Effect.gen(function* () {
            yield* stored(id)
            const author = yield* speaker
            const at = yield* now
            const added = { id: yield* Id.generate(Domain.CommentId), author, at, ...input }
            yield* run(
              "work.task.commented",
              `task/${id}`,
              Option.none(),
              Effect.andThen(tasks.addComment(id, added), tasks.touch(id, at)),
              () => Option.some({ author, text: input.text, link: input.link ?? null })
            )
            return yield* task(id)
          }),

        link: (id, url) =>
          Effect.gen(function* () {
            yield* stored(id)
            const at = yield* now
            yield* run(
              "work.task.linked",
              `task/${id}`,
              Option.none(),
              Effect.andThen(tasks.addLink(id, url), tasks.touch(id, at)),
              () => Option.some({ url })
            )
            return yield* task(id)
          }),

        unlink: (id, url) =>
          Effect.gen(function* () {
            yield* stored(id)
            const at = yield* now
            yield* run(
              "work.task.unlinked",
              `task/${id}`,
              Option.some({ url }),
              Effect.andThen(tasks.removeLink(id, url), tasks.touch(id, at)),
              () => Option.none()
            )
            return yield* task(id)
          })
      })
    })
  )
}
