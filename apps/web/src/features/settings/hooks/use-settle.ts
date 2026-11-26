import * as ReactQuery from "@tanstack/react-query"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"
import * as Work from "@/features/tasks/lib/work"

/** Settles every write the same way: refetch on success, the refusal's reason on failure. */
export const useSettle = () => {
  const { t } = ReactI18next.useTranslation("Settings")
  const client = ReactQuery.useQueryClient()
  return {
    onSuccess: () => client.invalidateQueries(),
    onError: (error: unknown) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  }
}
