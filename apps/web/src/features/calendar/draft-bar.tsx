import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"

import * as Button from "@/components/ui/button"
import * as Dialog from "@/components/ui/dialog"
import * as Work from "@/features/tasks/work"
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

/** Under the grid while drafting is on or a draft is in view: confirm every draft, or discard every draft. */
export function DraftBar({ drafting, inView, onDone }: { drafting: boolean; inView: number; onDone: () => void }) {
  const { t } = ReactI18next.useTranslation("Calendar")
  const client = ReactQuery.useQueryClient()
  const [discarding, setDiscarding] = React.useState(false)
  const confirm = useConfirmDrafts(onDone)
  const discard = ReactQuery.useMutation({
    ...Queries.workDiscardDraftsMutation(),
    onSuccess: () => {
      setDiscarding(false)
      onDone()
      return client.invalidateQueries()
    },
    onError: (error) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  })

  if (!drafting && inView === 0) return null
  const busy = confirm.isPending || discard.isPending

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed bg-muted/60 px-4 py-2">
      <LucideReact.PencilRulerIcon className="size-4 text-muted-foreground" aria-hidden="true" />
      <p className="me-auto text-sm">
        <span className="font-medium">{t(drafting ? "draft.on" : "draft.left")}</span>
        <span className="text-muted-foreground"> · {t("draft.inView", { count: inView })}</span>
      </p>
      <Button.Button variant="outline" disabled={busy} onClick={() => setDiscarding(true)}>
        <LucideReact.Trash2Icon />
        {t("draft.discardAll")}
      </Button.Button>
      <Button.Button disabled={busy} onClick={() => confirm.mutate({ body: {} })}>
        <LucideReact.CheckCheckIcon />
        {t("draft.confirmAll")}
      </Button.Button>
      <Dialog.Dialog open={discarding} onOpenChange={setDiscarding}>
        <Dialog.DialogContent>
          <Dialog.DialogHeader>
            <Dialog.DialogTitle>{t("draft.discardTitle")}</Dialog.DialogTitle>
            <Dialog.DialogDescription>{t("draft.discardDescription")}</Dialog.DialogDescription>
          </Dialog.DialogHeader>
          <Dialog.DialogFooter>
            <Button.Button variant="outline" onClick={() => setDiscarding(false)}>
              {t("draft.keep")}
            </Button.Button>
            <Button.Button variant="destructive" disabled={discard.isPending} onClick={() => discard.mutate({})}>
              {t("draft.discardAll")}
            </Button.Button>
          </Dialog.DialogFooter>
        </Dialog.DialogContent>
      </Dialog.Dialog>
    </div>
  )
}
