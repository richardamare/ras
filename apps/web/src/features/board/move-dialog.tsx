import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"

import * as Button from "@/components/ui/button"
import * as Dialog from "@/components/ui/dialog"
import * as Textarea from "@/components/ui/textarea"
import * as Work from "@/features/tasks/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import * as DialogStore from "@/lib/dialog-store"

interface Move {
  readonly task: { readonly id: string; readonly title: string }
  readonly status: Work.Status
}

export const useMoveDialog = DialogStore.createDialogStore<Move>()

/** The comment a move into `blocked` or `review` takes: what is needed, or what to check. */
export function MoveDialog({
  open,
  onOpenChange,
  task,
  status
}: Move & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = ReactI18next.useTranslation("Work")
  const client = ReactQuery.useQueryClient()
  const [comment, setComment] = React.useState("")
  const change = ReactQuery.useMutation({
    ...Queries.workChangeTaskMutation(),
    onSuccess: () => {
      onOpenChange(false)
      return client.invalidateQueries()
    },
    onError: (error) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  })

  return (
    <Dialog.Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.DialogContent>
        <Dialog.DialogHeader>
          <Dialog.DialogTitle>
            {t("board.moveTitle", { task: task.title, status: t(`status.${status}`) })}
          </Dialog.DialogTitle>
          <Dialog.DialogDescription>
            {status === "blocked" ? t("board.whatIsNeeded") : t("board.whatToCheck")}
          </Dialog.DialogDescription>
        </Dialog.DialogHeader>
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault()
            change.mutate({ path: { id: task.id }, body: { status, comment: comment.trim() } })
          }}
        >
          <Dialog.DialogBody>
            <Textarea.Textarea
              autoFocus
              aria-label={t("comment")}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </Dialog.DialogBody>
          <Dialog.DialogFooter>
            <Button.Button type="submit" disabled={comment.trim().length === 0 || change.isPending}>
              {t("board.move")}
            </Button.Button>
          </Dialog.DialogFooter>
        </form>
      </Dialog.DialogContent>
    </Dialog.Dialog>
  )
}
