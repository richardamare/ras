import * as DialogStore from "@/lib/dialog-store"

export interface ConfirmRequest {
  readonly title: string
  readonly description: string
  readonly confirmLabel: string
  /** The app's own Cancel when left out. */
  readonly cancelLabel?: string
  readonly destructive?: boolean
  readonly onConfirm: () => void
}

export const useConfirmDialog = DialogStore.createDialogStore<ConfirmRequest>()
