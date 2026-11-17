import * as ReactI18next from "react-i18next"

import * as Button from "@/components/ui/button"
import * as Dialog from "@/components/ui/dialog"
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

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm
}: ConfirmRequest & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = ReactI18next.useTranslation()
  return (
    <Dialog.Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.DialogContent>
        <Dialog.DialogHeader>
          <Dialog.DialogTitle>{title}</Dialog.DialogTitle>
          <Dialog.DialogDescription>{description}</Dialog.DialogDescription>
        </Dialog.DialogHeader>
        <Dialog.DialogFooter>
          <Button.Button variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel ?? t("cancel")}
          </Button.Button>
          <Button.Button
            variant={destructive === true ? "destructive" : "default"}
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            {confirmLabel}
          </Button.Button>
        </Dialog.DialogFooter>
      </Dialog.DialogContent>
    </Dialog.Dialog>
  )
}
