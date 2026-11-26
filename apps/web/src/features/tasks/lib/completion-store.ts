import * as Sonner from "sonner"
import * as ZustandVanilla from "zustand/vanilla"

import type * as Api from "@/lib/api/generated/types.gen"

/** `pending` can still be undone; `closing` is fading away while the close is saved. */
export type Phase = "pending" | "closing"

export type Closable = Pick<Api.TaskSummaryEncoded, "id" | "title" | "status">

export const undoMs = 4000
export const fadeMs = 300

export const store = ZustandVanilla.createStore<{ phases: ReadonlyMap<string, Phase> }>()(() => ({ phases: new Map() }))
export const timers = new Map<string, ReturnType<typeof setTimeout>>()

export const setPhase = (id: string, phase: Phase | null) =>
  store.setState(({ phases }) => {
    const next = new Map(phases)
    if (phase === null) next.delete(id)
    else next.set(id, phase)
    return { phases: next }
  })

export const toastId = (id: string) => `task-completion-${id}`

export const undo = (id: string) => {
  clearTimeout(timers.get(id))
  timers.delete(id)
  Sonner.toast.dismiss(toastId(id))
  setPhase(id, null)
}
