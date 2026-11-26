import * as ReactQuery from "@tanstack/react-query"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"
import * as UseConfirmDialog from "@/hooks/use-confirm-dialog"
import * as Work from "@/features/tasks/lib/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import type * as Api from "@/lib/api/generated/types.gen"

/**
 * Asks first, then deletes the task. The API deletes a task with no work begun on it, and moves one with work to done
 * instead; the toast says which.
 */
export const useDeleteTask = (onDeleted: () => void = () => {}) => {
  const { t } = ReactI18next.useTranslation("Work")
  const confirm = UseConfirmDialog.useConfirmDialog()
  const client = ReactQuery.useQueryClient()
  const remove = ReactQuery.useMutation(Queries.workDeleteTaskMutation())

  return (task: Pick<Api.TaskEncoded, "id" | "title">) =>
    confirm.open({
      title: t("delete.title", { title: task.title }),
      description: t("delete.description"),
      confirmLabel: t("delete.confirm"),
      cancelLabel: t("delete.keep"),
      destructive: true,
      onConfirm: () =>
        void remove.mutateAsync({ path: { id: task.id } }).then(
          (kept) => {
            Sonner.toast.success(t(kept === null ? "delete.deleted" : "delete.closed", { title: task.title }))
            onDeleted()
            return client.invalidateQueries()
          },
          (error: unknown) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
        )
    })
}
