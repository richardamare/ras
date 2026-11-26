import type * as Api from "@/lib/api/generated/types.gen"
import * as DialogStore from "@/lib/dialog-store"

export const useBlockMoveDialog = DialogStore.createDialogStore<{ block: Api.BlockEncoded }>()
