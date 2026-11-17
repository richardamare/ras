import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Toolkit from "effect/ai/Toolkit"
import * as Global from "@ras/global"
import * as Blocks from "./Blocks.ts"
import * as Board from "./Board.ts"
import * as Domain from "./Domain.ts"

const TaskRef = { task: Domain.TaskId }

export const toolkit = Toolkit.make(
  Global.read("spaces", {
    description: "The spaces work belongs to, such as personal or a client. One is the default.",
    success: Schema.Array(Domain.Space)
  }),
  Global.read("projects", {
    description: "Every project, or the projects of one space: name, status, deadline and space.",
    parameters: Schema.Struct({ space: Schema.optionalKey(Domain.SpaceId) }),
    success: Schema.Array(Domain.Project)
  }),
  Global.read("project", {
    description: "One project with its tasks.",
    parameters: Schema.Struct({ project: Domain.ProjectId }),
    success: Domain.ProjectDetail
  }),
  Global.read("tasks", {
    description:
      "Tasks on the board, open work first by deadline. An agent polls for its work with its own `assignee`, status `todo` and `updatedSince`.",
    parameters: Domain.TaskFilter,
    success: Schema.Array(Domain.TaskSummary)
  }),
  Global.read("task", {
    description: "One task with its body (the brief), its comments (the log) and its links.",
    parameters: Schema.Struct(TaskRef),
    success: Domain.Task
  }),
  Global.writeTool("add_project", {
    description: "Adds a project to a space, the default space when none is given.",
    parameters: Domain.NewProject.fields,
    success: Domain.Project,
    destructive: false
  }),
  Global.writeTool("update_project", {
    description: "Changes a project. Moving it to another space takes its tasks along.",
    parameters: { project: Domain.ProjectId, ...Domain.ProjectChange.fields },
    success: Domain.Project,
    destructive: false
  }),
  Global.writeTool("add_task", {
    description:
      "Adds a task. What the owner asks for starts in `todo`; work an agent proposes on its own starts in `inbox`. The body is the brief, from the owner's words.",
    parameters: Domain.NewTask.fields,
    success: Domain.Task,
    destructive: false
  }),
  Global.writeTool("update_task", {
    description:
      "Changes a task: status, assignee, title, deadline and the rest. A move to `blocked` or `review` needs `comment`, saying what is needed or what to check. Only the owner changes the body.",
    parameters: { ...TaskRef, ...Domain.TaskChange.fields },
    success: Domain.Task,
    destructive: false
  }),
  Global.writeTool("delete_task", {
    description: "Deletes a task with its comments and links.",
    parameters: TaskRef,
    destructive: true
  }),
  Global.writeTool("comment_task", {
    description: "Appends to a task's log: progress, a question or a result, with an optional link to the output.",
    parameters: { ...TaskRef, ...Domain.NewComment.fields },
    success: Domain.Task,
    destructive: false
  }),
  Global.writeTool("link_task", {
    description: "Attaches a GitHub issue or pull request to a task by its URL.",
    parameters: { ...TaskRef, url: Domain.LinkUrl },
    success: Domain.Task,
    destructive: false
  }),
  Global.writeTool("unlink_task", {
    description: "Detaches a GitHub issue or pull request from a task.",
    parameters: { ...TaskRef, url: Domain.LinkUrl },
    success: Domain.Task,
    destructive: false
  }),
  Global.writeTool("plan_work", {
    description:
      "Plans a block of work on one of the owner's open tasks, at a Prague local start and a length, as an event in its space's calendar. With `draft` the block stays in ras, taking its time, until confirm_drafts writes it.",
    parameters: Domain.PlanWork.fields,
    success: Domain.Block,
    destructive: false
  }),
  Global.writeTool("start_work", {
    description: "Starts work on one of the owner's open tasks now. One block runs at a time.",
    parameters: TaskRef,
    success: Domain.Block,
    destructive: false
  }),
  Global.writeTool("stop_work", {
    description: "Stops the running block now, and its event ends at the same time.",
    parameters: {},
    success: Domain.Block,
    destructive: false
  }),
  Global.writeTool("log_work", {
    description: "Records work on a task that already happened: its Prague local end and its length in minutes.",
    parameters: Domain.LogWork.fields,
    success: Domain.Block,
    destructive: false
  }),
  Global.writeTool("move_work", {
    description:
      "Moves or resizes a block that is not running, with its event. A planned block stays from now on; work that has ended stays in the past.",
    parameters: Domain.MoveWork.fields,
    success: Domain.Block,
    destructive: false
  }),
  Global.writeTool("remove_work", {
    description: "Removes a block that is not running, with its event.",
    parameters: { block: Domain.BlockId },
    destructive: true
  })
)

export const handlers = toolkit.toLayer(
  Effect.gen(function* () {
    const board = yield* Board.Board
    const blocks = yield* Blocks.Blocks
    const actingAs = yield* Global.actingAs
    return {
      spaces: () => board.spaces,
      projects: ({ space }) => board.projects(Option.fromUndefinedOr(space)),
      project: ({ project }) => board.project(project),
      tasks: (filter) => board.tasks(filter),
      task: ({ task }) => board.task(task),
      add_project: ({ agent, ...project }) => board.addProject(project).pipe(actingAs(agent)),
      update_project: ({ agent, project, ...change }) => board.changeProject(project, change).pipe(actingAs(agent)),
      add_task: ({ agent, ...task }) => board.addTask(task).pipe(actingAs(agent)),
      update_task: ({ agent, task, ...change }) => board.changeTask(task, change).pipe(actingAs(agent)),
      delete_task: ({ agent, task }) => board.deleteTask(task).pipe(actingAs(agent)),
      comment_task: ({ agent, task, ...comment }) => board.comment(task, comment).pipe(actingAs(agent)),
      link_task: ({ agent, task, url }) => board.link(task, url).pipe(actingAs(agent)),
      unlink_task: ({ agent, task, url }) => board.unlink(task, url).pipe(actingAs(agent)),
      plan_work: ({ agent, ...input }) => blocks.plan(input).pipe(actingAs(agent)),
      start_work: ({ agent, task }) => blocks.start(task).pipe(actingAs(agent)),
      stop_work: ({ agent }) => blocks.stop.pipe(actingAs(agent)),
      log_work: ({ agent, ...input }) => blocks.log(input).pipe(actingAs(agent)),
      move_work: ({ agent, ...input }) => blocks.move(input).pipe(actingAs(agent)),
      remove_work: ({ agent, block }) => blocks.remove(block).pipe(actingAs(agent))
    }
  })
)
