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
import * as Domain from "./Domain.ts"
import * as Drafts from "./drafts/Drafts.ts"

const failures = [Errors.Refused, Errors.NotFound, Errors.Invalid, Errors.SourceFailed]

export const group = HttpApiGroup.make("work")
  .add(HttpApiEndpoint.get("spaces", "/spaces", { success: Schema.Array(Domain.Space) }))
  .add(
    HttpApiEndpoint.post("addSpace", "/spaces", { payload: Domain.NewSpace, success: Domain.Space, error: failures })
  )
  .add(
    HttpApiEndpoint.patch("changeSpace", "/spaces/:id", {
      params: { id: Domain.SpaceId },
      payload: Domain.SpaceChange,
      success: Domain.Space,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.post("archiveSpace", "/spaces/:id/archive", {
      params: { id: Domain.SpaceId },
      success: Domain.Space,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.get("projects", "/projects", {
      query: { space: Schema.optionalKey(Domain.SpaceId) },
      success: Schema.Array(Domain.Project)
    })
  )
  .add(
    HttpApiEndpoint.get("project", "/projects/:id", {
      params: { id: Domain.ProjectId },
      success: Domain.ProjectDetail,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.post("addProject", "/projects", {
      payload: Domain.NewProject,
      success: Domain.Project,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.patch("changeProject", "/projects/:id", {
      params: { id: Domain.ProjectId },
      payload: Domain.ProjectChange,
      success: Domain.Project,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.get("tasks", "/tasks", {
      query: Domain.TaskFilter.fields,
      success: Schema.Array(Domain.TaskSummary),
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.get("task", "/tasks/:id", { params: { id: Domain.TaskId }, success: Domain.Task, error: failures })
  )
  .add(HttpApiEndpoint.post("addTask", "/tasks", { payload: Domain.NewTask, success: Domain.Task, error: failures }))
  .add(
    HttpApiEndpoint.patch("changeTask", "/tasks/:id", {
      params: { id: Domain.TaskId },
      payload: Domain.TaskChange,
      success: Domain.Task,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.delete("deleteTask", "/tasks/:id", {
      params: { id: Domain.TaskId },
      success: Schema.NullOr(Domain.Task),
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.post("comment", "/tasks/:id/comments", {
      params: { id: Domain.TaskId },
      payload: Domain.NewComment,
      success: Domain.Task,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.post("link", "/tasks/:id/links", {
      params: { id: Domain.TaskId },
      payload: Schema.Struct({ url: Domain.LinkUrl }),
      success: Domain.Task,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.delete("unlink", "/tasks/:id/links", {
      params: { id: Domain.TaskId },
      query: { url: Domain.LinkUrl },
      success: Domain.Task,
      error: failures
    })
  )
  .add(
    HttpApiEndpoint.get("blocks", "/blocks", {
      query: { from: Time.PragueLocal, to: Time.PragueLocal },
      success: Schema.Array(Domain.Block),
      error: failures
    })
  )
  .add(HttpApiEndpoint.get("running", "/blocks/running", { success: Schema.NullOr(Domain.Block) }))
  .add(HttpApiEndpoint.post("plan", "/blocks", { payload: Domain.PlanWork, success: Domain.Block, error: failures }))
  .add(
    HttpApiEndpoint.post("start", "/blocks/start", {
      payload: Schema.Struct({ task: Domain.TaskId }),
      success: Domain.Block,
      error: failures
    })
  )
  .add(HttpApiEndpoint.post("stop", "/blocks/stop", { success: Domain.Block, error: failures }))
  .add(HttpApiEndpoint.post("log", "/blocks/log", { payload: Domain.LogWork, success: Domain.Block, error: failures }))
  .add(
    HttpApiEndpoint.patch("move", "/blocks/:id", {
      params: { id: Domain.BlockId },
      payload: Schema.Struct({ start: Time.PragueLocal, end: Time.PragueLocal }),
      success: Domain.Block,
      error: failures
    })
  )
  .add(HttpApiEndpoint.delete("remove", "/blocks/:id", { params: { id: Domain.BlockId }, error: failures }))
  .add(
    HttpApiEndpoint.post("confirmDrafts", "/drafts/confirm", {
      payload: Domain.ConfirmDrafts,
      success: Domain.DraftsConfirmed,
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
      .handle("running", () => Effect.map(blocks.running, Option.getOrNull))
      .handle("plan", ({ payload }) => blocks.plan(payload))
      .handle("start", ({ payload }) => blocks.start(payload.task))
      .handle("stop", () => blocks.stop)
      .handle("log", ({ payload }) => blocks.log(payload))
      .handle("move", ({ params, payload }) => blocks.move({ block: params.id, ...payload }))
      .handle("remove", ({ params }) => blocks.remove(params.id))
      .handle("confirmDrafts", ({ payload }) => drafts.confirm(payload))
      .handle("discardDrafts", () => Effect.map(drafts.discard, (discarded) => ({ discarded })))
  })
)
