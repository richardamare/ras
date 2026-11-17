import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"

import * as ConfirmDialog from "@/components/confirm-dialog"
import * as IconButton from "@/components/icon-button"
import * as Button from "@/components/ui/button"
import * as Tooltip from "@/components/ui/tooltip"
import * as Work from "@/features/tasks/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import * as Utils from "@/lib/utils"

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

/**
 * The Draft toggle in the calendar's toolbar. While drafting is on or a draft is in view it grows to show how many
 * drafts the view holds, with buttons that confirm every draft or discard every draft.
 */
export function DraftControls({
  drafting,
  inView,
  onDrafting
}: {
  drafting: boolean
  inView: number
  onDrafting: (drafting: boolean) => void
}) {
  const { t } = ReactI18next.useTranslation("Calendar")
  const client = ReactQuery.useQueryClient()
  const confirmDialog = ConfirmDialog.useConfirmDialog()
  const confirm = useConfirmDrafts(() => onDrafting(false))
  const discard = ReactQuery.useMutation({
    ...Queries.workDiscardDraftsMutation(),
    onSuccess: () => {
      onDrafting(false)
      return client.invalidateQueries()
    },
    onError: (error) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  })
  const busy = confirm.isPending || discard.isPending
  const open = drafting || inView > 0

  return (
    <div
      className={Utils.cn(
        "flex items-center gap-0.5 rounded-lg border p-0.5",
        drafting && "border-dashed border-primary/60 bg-primary-soft"
      )}
    >
      <Tooltip.Tooltip>
        <Tooltip.TooltipTrigger asChild>
          <Button.Button
            size="sm"
            variant={drafting ? "secondary" : "ghost"}
            aria-pressed={drafting}
            onClick={() => onDrafting(!drafting)}
          >
            <LucideReact.PencilRulerIcon />
            {t("draft.toggle")}
          </Button.Button>
        </Tooltip.TooltipTrigger>
        <Tooltip.TooltipContent className="max-w-64">{t("draft.on")}</Tooltip.TooltipContent>
      </Tooltip.Tooltip>
      {open && (
        <>
          <span className="px-1.5 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {t("draft.inView", { count: inView })}
          </span>
          <IconButton.IconButton
            label={t("draft.confirmAll")}
            className="size-7 text-primary"
            disabled={busy || inView === 0}
            onClick={() => confirm.mutate({ body: {} })}
          >
            <LucideReact.CheckCheckIcon />
          </IconButton.IconButton>
          <IconButton.IconButton
            label={t("draft.discardAll")}
            className="size-7 text-destructive"
            disabled={busy || inView === 0}
            onClick={() =>
              confirmDialog.open({
                title: t("draft.discardTitle"),
                description: t("draft.discardDescription"),
                confirmLabel: t("draft.discardAll"),
                cancelLabel: t("draft.keep"),
                destructive: true,
                onConfirm: () => discard.mutate({})
              })
            }
          >
            <LucideReact.Trash2Icon />
          </IconButton.IconButton>
        </>
      )}
    </div>
  )
}
