import * as ReactQuery from "@tanstack/react-query"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"
import * as UseConfirmDialog from "@/hooks/use-confirm-dialog"
import * as Work from "@/features/tasks/lib/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import type * as Api from "@/lib/api/generated/types.gen"

/** Removes a block that is not running. A finished one asks first, because its time leaves the task's spent time. */
export const useRemoveBlock = () => {
  const { t } = ReactI18next.useTranslation("Work")
  const confirm = UseConfirmDialog.useConfirmDialog()
  const client = ReactQuery.useQueryClient()
  const remove = ReactQuery.useMutation(Queries.workRemoveMutation())
  const run = (block: Api.BlockEncoded) =>
    void remove.mutateAsync({ path: { id: block.id } }).then(
      () => client.invalidateQueries(),
      (error: unknown) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
    )

  return (block: Api.BlockEncoded) =>
    block.state === "done"
      ? confirm.open({
          title: t("log.removeTitle"),
          description: t("log.removeDescription"),
          confirmLabel: t("log.remove"),
          cancelLabel: t("log.keep"),
          destructive: true,
          onConfirm: () => run(block)
        })
      : run(block)
}
