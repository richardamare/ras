import * as DialogStore from "@/lib/dialog-store"
import type * as Api from "@/lib/api/generated/types.gen"

export const useBlockDialog = DialogStore.createDialogStore<{ task: Pick<Api.TaskSummaryEncoded, "id" | "title"> }>()
