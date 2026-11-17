import * as ReactQuery from "@tanstack/react-query"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"
import * as Zustand from "zustand"
import * as ZustandVanilla from "zustand/vanilla"

import * as Checkbox from "@/components/ui/checkbox"
import * as Work from "@/features/tasks/work"
import * as Sdk from "@/lib/api/generated/sdk.gen"
import type * as Api from "@/lib/api/generated/types.gen"

/** `pending` can still be undone; `closing` is fading away while the close is saved. */
export type Phase = "pending" | "closing"

type Closable = Pick<Api.TaskSummaryEncoded, "id" | "title" | "status">

export const undoMs = 4000
const fadeMs = 300

const store = ZustandVanilla.createStore<{ phases: ReadonlyMap<string, Phase> }>()(() => ({ phases: new Map() }))
const timers = new Map<string, ReturnType<typeof setTimeout>>()

const setPhase = (id: string, phase: Phase | null) =>
  store.setState(({ phases }) => {
    const next = new Map(phases)
    if (phase === null) next.delete(id)
    else next.set(id, phase)
    return { phases: next }
  })

const toastId = (id: string) => `task-completion-${id}`

const undo = (id: string) => {
  clearTimeout(timers.get(id))
  timers.delete(id)
  Sonner.toast.dismiss(toastId(id))
  setPhase(id, null)
}

/**
 * Closing a task waits `undoMs` before it is saved: the task shows crossed out with a toast to undo it, then fades and
 * moves to done. The phases live outside React, so every place showing the task agrees and a timer outlives the row
 * that started it. Reopening a done task moves it to To do at once.
 */
export const useTaskCompletion = () => {
  const { t } = ReactI18next.useTranslation("Work")
  const client = ReactQuery.useQueryClient()
  const phases = Zustand.useStore(store, (state) => state.phases)

  const save = async (task: Closable, status: Work.Status) => {
    try {
      await Sdk.workChangeTask({ path: { id: task.id }, body: { status }, throwOnError: true })
      await client.invalidateQueries()
    } catch (error) {
      Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
    }
  }

  const close = async (task: Closable) => {
    timers.delete(task.id)
    setPhase(task.id, "closing")
    await new Promise((resolve) => setTimeout(resolve, fadeMs))
    await save(task, "done")
    setPhase(task.id, null)
  }

  const schedule = (task: Closable) => {
    setPhase(task.id, "pending")
    timers.set(
      task.id,
      setTimeout(() => void close(task), undoMs)
    )
    Sonner.toast(t("completion.closed", { title: task.title }), {
      id: toastId(task.id),
      duration: undoMs,
      action: { label: t("completion.undo"), onClick: () => undo(task.id) }
    })
  }

  return {
    phaseOf: (id: string): Phase | undefined => phases.get(id),
    toggle: (task: Closable) => {
      if (task.status === "done") return void save(task, "todo")
      const phase = phases.get(task.id)
      if (phase === "pending") undo(task.id)
      else if (phase === undefined) schedule(task)
    }
  }
}

/** How a row looks while its task is closing. */
export const rowClass: Record<Phase, string> = {
  pending: "opacity-50 line-through",
  closing: "line-through opacity-0 transition-opacity duration-300"
}

/** Ticks a task done, with a few seconds to undo it by clicking again, or reopens a done one. */
export function DoneCheckbox({ task }: { task: Closable }) {
  const { t } = ReactI18next.useTranslation("Work")
  const completion = useTaskCompletion()
  const phase = completion.phaseOf(task.id)
  const label =
    phase === "pending" ? t("completion.undo") : task.status === "done" ? t("completion.reopen") : t("completion.done")

  return (
    <span
      className="flex shrink-0"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Checkbox.Checkbox
        checked={task.status === "done" || phase !== undefined}
        disabled={phase === "closing"}
        aria-label={`${label}: ${task.title}`}
        onCheckedChange={() => completion.toggle(task)}
      />
    </span>
  )
}
