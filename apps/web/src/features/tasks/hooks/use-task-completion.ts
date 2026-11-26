import * as ReactQuery from "@tanstack/react-query"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"
import * as Zustand from "zustand"
import * as Work from "@/features/tasks/lib/work"
import * as Sdk from "@/lib/api/generated/sdk.gen"
import * as CompletionStore from "@/features/tasks/lib/completion-store"

/**
 * Closing a task waits `undoMs` before it is saved: the task shows crossed out with a toast to undo it, then fades and
 * moves to done. The phases live outside React, so every place showing the task agrees and a timer outlives the row
 * that started it. Reopening a done task moves it to To do at once.
 */
export const useTaskCompletion = () => {
  const { t } = ReactI18next.useTranslation("Work")
  const client = ReactQuery.useQueryClient()
  const phases = Zustand.useStore(CompletionStore.store, (state) => state.phases)

  const save = async (task: CompletionStore.Closable, status: Work.Status) => {
    try {
      await Sdk.workChangeTask({ path: { id: task.id }, body: { status }, throwOnError: true })
      await client.invalidateQueries()
    } catch (error) {
      Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
    }
  }

  const close = async (task: CompletionStore.Closable) => {
    CompletionStore.timers.delete(task.id)
    CompletionStore.setPhase(task.id, "closing")
    await new Promise((resolve) => setTimeout(resolve, CompletionStore.fadeMs))
    await save(task, "done")
    CompletionStore.setPhase(task.id, null)
  }

  const schedule = (task: CompletionStore.Closable) => {
    CompletionStore.setPhase(task.id, "pending")
    CompletionStore.timers.set(
      task.id,
      setTimeout(() => void close(task), CompletionStore.undoMs)
    )
    Sonner.toast(t("completion.closed", { title: task.title }), {
      id: CompletionStore.toastId(task.id),
      duration: CompletionStore.undoMs,
      action: { label: t("completion.undo"), onClick: () => CompletionStore.undo(task.id) }
    })
  }

  return {
    phaseOf: (id: string): CompletionStore.Phase | undefined => phases.get(id),
    toggle: (task: CompletionStore.Closable) => {
      if (task.status === "done") return void save(task, "todo")
      const phase = phases.get(task.id)
      if (phase === "pending") CompletionStore.undo(task.id)
      else if (phase === undefined) schedule(task)
    }
  }
}
