import * as ReactQuery from "@tanstack/react-query"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"

import * as Work from "@/features/tasks/lib/work"

/** A mutation's callbacks that refetch everything on success and toast the API's reason on failure. */
export const useSettled = () => {
  const { t } = ReactI18next.useTranslation("Work")
  const client = ReactQuery.useQueryClient()
  return {
    onSuccess: () => client.invalidateQueries(),
    onError: (error: unknown) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  }
}
