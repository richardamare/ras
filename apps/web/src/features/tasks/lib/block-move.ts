import type * as Api from "@/lib/api/generated/types.gen"

export interface BlockMoveForm {
  readonly day: string
  readonly start: string
  readonly end: string
}

/** The block's day and times as the form shows them; a running block has no end, so it stands at its start. */
export const formOf = (block: Api.BlockEncoded): BlockMoveForm => ({
  day: block.start.slice(0, 10),
  start: block.start.slice(11),
  end: (block.end ?? block.start).slice(11)
})

/** The span the block moves to, or none while the end is not after the start. */
export const spanOf = (form: BlockMoveForm): Api.WorkMoveData["body"] | undefined =>
  form.end > form.start ? { start: `${form.day}T${form.start}`, end: `${form.day}T${form.end}` } : undefined
