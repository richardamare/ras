import * as ReactI18next from "react-i18next"

import * as Checkbox from "@/components/ui/checkbox"
import * as UseTaskCompletion from "@/features/tasks/hooks/use-task-completion"
import * as CompletionStore from "@/features/tasks/lib/completion-store"

/** How a row looks while its task is closing. */
export const rowClass: Record<CompletionStore.Phase, string> = {
  pending: "opacity-50 line-through",
  closing: "line-through opacity-0 transition-opacity duration-300"
}

/** Ticks a task done, with a few seconds to undo it by clicking again, or reopens a done one. */
export function DoneCheckbox({ task }: { task: CompletionStore.Closable }) {
  const { t } = ReactI18next.useTranslation("Work")
  const completion = UseTaskCompletion.useTaskCompletion()
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
