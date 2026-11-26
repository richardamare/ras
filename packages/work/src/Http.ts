import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder"
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint"
import * as HttpApiGroup from "effect/http-api/HttpApiGroup"
import * as Global from "@ras/global"
import * as Errors from "@ras/kernel/Errors"
import * as Time from "@ras/kernel/Time"
import * as Blocks from "./blocks/Blocks.ts"
import * as Board from "./board/Board.ts"
import * as Block from "./blocks/Block.ts"
import * as Project from "./tasks/Project.ts"
import * as ProjectDetail from "./tasks/ProjectDetail.ts"
import * as Space from "./tasks/Space.ts"
import * as Task from "./tasks/Task.ts"
import * as Confirmation from "./drafts/Confirmation.ts"
import * as Drafts from "./drafts/Drafts.ts"

const failures = [Errors.Refused, Errors.NotFound, Errors.Invalid, Errors.SourceFailed]

export const group = HttpApiGroup.make("work")
  .add(HttpApiEndpoint.get("spaces", "/spaces", { success: Schema.Array(Space.Space) }))
  .add(HttpApiEndpoint.post("addSpace", "/spaces", { payload: Space.NewSpace, success: Space.Space, error: failures }))
  .add(
    HttpApiEndpoint.patch("changeSpace", "/spaces/:id", {
      params: { id: Space.SpaceId },
      payload: Space.SpaceChange,
      success: Space.Space,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.post("archiveSpace", "/spaces/:id/archive", {
      params: { id: Space.SpaceId },
      success: Space.Space,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.get("projects", "/projects", {
      query: { space: Schema.optionalKey(Space.SpaceId) },
      success: Schema.Array(Project.Project)
    })
  )
  .add(
    HttpApiEndpoint.get("project", "/projects/:id", {
      params: { id: Project.ProjectId },
      success: ProjectDetail.ProjectDetail,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.post("addProject", "/projects", {
      payload: Project.NewProject,
      success: Project.Project,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.patch("changeProject", "/projects/:id", {
      params: { id: Project.ProjectId },
      payload: Project.ProjectChange,
      success: Project.Project,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.get("tasks", "/tasks", {
      query: Task.TaskFilter.fields,
      success: Schema.Array(Task.TaskSummary),
      error: failures
    })
  )
  .add(HttpApiEndpoint.get("task", "/tasks/:id", { params: { id: Task.TaskId }, success: Task.Task, error: failures }))
  .add(HttpApiEndpoint.post("addTask", "/tasks", { payload: Task.NewTask, success: Task.Task, error: failures }))
  .add(
    HttpApiEndpoint.patch("changeTask", "/tasks/:id", {
      params: { id: Task.TaskId },
      payload: Task.TaskChange,
      success: Task.Task,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.delete("deleteTask", "/tasks/:id", {
      params: { id: Task.TaskId },
      success: Schema.NullOr(Task.Task),
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.post("comment", "/tasks/:id/comments", {
      params: { id: Task.TaskId },
      payload: Task.NewComment,
      success: Task.Task,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.post("link", "/tasks/:id/links", {
      params: { id: Task.TaskId },
      payload: Schema.Struct({ url: Task.LinkUrl }),
      success: Task.Task,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.delete("unlink", "/tasks/:id/links", {
      params: { id: Task.TaskId },
      query: { url: Task.LinkUrl },
      success: Task.Task,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.get("blocks", "/blocks", {
      query: { from: Time.PragueLocal, to: Time.PragueLocal },
      success: Schema.Array(Block.Block),
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.get("taskBlocks", "/tasks/:id/blocks", {
      params: { id: Task.TaskId },
      success: Schema.Array(Block.Block),
      error: failures
    })
  )
  .add(HttpApiEndpoint.get("running", "/blocks/running", { success: Schema.NullOr(Block.Block) }))
  .add(HttpApiEndpoint.post("add", "/blocks", { payload: Block.AddWork, success: Block.Block, error: failures }))
  .add(
    HttpApiEndpoint.post("start", "/blocks/start", {
      payload: Schema.Struct({ task: Task.TaskId }),
      success: Block.Block,
      error: failures
    })
  )
  .add(HttpApiEndpoint.post("stop", "/blocks/stop", { success: Block.Block, error: failures }))
  .add(
    HttpApiEndpoint.patch("move", "/blocks/:id", {
      params: { id: Block.BlockId },
      payload: Schema.Struct({ start: Time.PragueLocal, end: Time.PragueLocal }),
      success: Block.Block,
      error: failures
    })
  )
  .add(HttpApiEndpoint.delete("remove", "/blocks/:id", { params: { id: Block.BlockId }, error: failures }))
  .add(
    HttpApiEndpoint.post("confirmDrafts", "/drafts/confirm", {
      payload: Confirmation.ConfirmDrafts,
      success: Confirmation.DraftsConfirmed,
      error: failures
    })
  )
  .add(HttpApiEndpoint.delete("discardDrafts", "/drafts", { success: Schema.Struct({ discarded: Schema.Number }) }))
  .prefix("/work")

export const handlers = HttpApiBuilder.group(Global.api(group), "work", (endpoints) =>
  Effect.gen(function* () {
    const board = yield* Board.Board
    const blocks = yield* Blocks.Blocks
    const drafts = yield* Drafts.Drafts
    return endpoints
      .handle("spaces", () => board.spaces)
      .handle("addSpace", ({ payload }) => board.addSpace(payload))
      .handle("changeSpace", ({ params, payload }) => board.changeSpace(params.id, payload))
      .handle("archiveSpace", ({ params }) => board.archiveSpace(params.id))
      .handle("projects", ({ query }) => board.projects(Option.fromUndefinedOr(query.space)))
      .handle("project", ({ params }) => board.project(params.id))
      .handle("addProject", ({ payload }) => board.addProject(payload))
      .handle("changeProject", ({ params, payload }) => board.changeProject(params.id, payload))
      .handle("tasks", ({ query }) => board.tasks(query))
      .handle("task", ({ params }) => board.task(params.id))
      .handle("addTask", ({ payload }) => board.addTask(payload))
      .handle("changeTask", ({ params, payload }) => board.changeTask(params.id, payload))
      .handle("deleteTask", ({ params }) => Effect.map(board.deleteTask(params.id), Option.getOrNull))
      .handle("comment", ({ params, payload }) => board.comment(params.id, payload))
      .handle("link", ({ params, payload }) => board.link(params.id, payload.url))
      .handle("unlink", ({ params, query }) => board.unlink(params.id, query.url))
      .handle("blocks", ({ query }) => blocks.blocks(query))
      .handle("taskBlocks", ({ params }) => blocks.ofTask(params.id))
      .handle("running", () => Effect.map(blocks.running, Option.getOrNull))
      .handle("add", ({ payload }) => blocks.add(payload))
      .handle("start", ({ payload }) => blocks.start(payload.task))
      .handle("stop", () => blocks.stop)
      .handle("move", ({ params, payload }) => blocks.move({ block: params.id, ...payload }))
      .handle("remove", ({ params }) => blocks.remove(params.id))
      .handle("confirmDrafts", ({ payload }) => drafts.confirm(payload))
      .handle("discardDrafts", () => Effect.map(drafts.discard, (discarded) => ({ discarded })))
  })
)
