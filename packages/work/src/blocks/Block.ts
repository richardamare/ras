import * as Schema from "effect/Schema"
import * as Calendar from "@ras/calendar"
import * as Id from "@ras/kernel/Id"
import * as Time from "@ras/kernel/Time"
import * as Task from "../tasks/Task.ts"

export const BlockId = Id.Uuid.pipe(Schema.brand("BlockId"))
export type BlockId = typeof BlockId.Type

/**
 * `draft` is planned and has no event; `planned` is in its calendar and has not ended; `running` is the one block worked
 * on now; `done` is in its calendar and has ended, and counts as time spent.
 */
export const BlockState = Schema.Literals(["draft", "planned", "running", "done"])
export type BlockState = typeof BlockState.Type

export class Block extends Schema.Class<Block>("Block")({
  id: BlockId,
  task: Task.TaskId,
  title: Schema.String.annotate({ description: "The project and the task, as its event is titled." }),
  calendar: Calendar.CalendarId,
  start: Time.PragueLocal,
  end: Schema.NullOr(Time.PragueLocal).annotate({ description: "None while it runs." }),
  state: BlockState
}) {}

export const AddWork = Schema.Struct({
  task: Task.TaskId,
  start: Time.PragueLocal,
  end: Time.PragueLocal,
  draft: Schema.optionalKey(Schema.Boolean).annotate({
    description: "Keeps the block in ras, taking its time, until confirm_drafts writes its event."
  })
})
export type AddWork = typeof AddWork.Type

export const MoveWork = Schema.Struct({
  block: BlockId,
  start: Time.PragueLocal,
  end: Time.PragueLocal
})
export type MoveWork = typeof MoveWork.Type
