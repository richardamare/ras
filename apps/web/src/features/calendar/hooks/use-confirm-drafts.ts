import * as ReactQuery from "@tanstack/react-query"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"
import * as Work from "@/features/tasks/lib/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"

/** Confirms drafts and toasts each one its calendar refused, with the reason. */
export const useConfirmDrafts = (onConfirmed: () => void = () => {}) => {
  const { t } = ReactI18next.useTranslation("Calendar")
  const client = ReactQuery.useQueryClient()
  return ReactQuery.useMutation({
    ...Queries.workConfirmDraftsMutation(),
    onSuccess: (result) => {
      for (const refused of result.refused)
        Sonner.toast.error(t("draft.refused", { title: refused.title, reason: refused.refusal ?? "" }))
      if (result.refused.length === 0) onConfirmed()
      return client.invalidateQueries()
    },
    onError: (error) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  })
}
