import type * as Work from "@/features/tasks/lib/work"
import * as DialogStore from "@/lib/dialog-store"

export interface Move {
  readonly task: { readonly id: string; readonly title: string }
  readonly status: Work.Status
}

export const useMoveDialog = DialogStore.createDialogStore<Move>()
