import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"

import * as Button from "@/components/ui/button"
import * as Dialog from "@/components/ui/dialog"
import * as Input from "@/components/ui/input"
import * as Label from "@/components/ui/label"
import * as BlockMove from "@/features/calendar/block-move"
import * as Work from "@/features/tasks/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import type * as Api from "@/lib/api/generated/types.gen"
import * as DialogStore from "@/lib/dialog-store"

export const useBlockMoveDialog = DialogStore.createDialogStore<{ block: Api.BlockEncoded }>()

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Label.Label className="grid gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </Label.Label>
  )
}

/** Moves or resizes a work block that is not running, typed rather than dragged. */
export function BlockMoveDialog({
  open,
  onOpenChange,
  block
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  block: Api.BlockEncoded
}) {
  const { t } = ReactI18next.useTranslation("Calendar")
  const client = ReactQuery.useQueryClient()
  const [form, setForm] = React.useState(() => BlockMove.formOf(block))
  const set = (edit: Partial<BlockMove.BlockMoveForm>) => setForm((current) => ({ ...current, ...edit }))
  const span = BlockMove.spanOf(form)
  const move = ReactQuery.useMutation({
    ...Queries.workMoveMutation(),
    onSuccess: () => {
      onOpenChange(false)
      return client.invalidateQueries()
    },
    onError: (error) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  })

  return (
    <Dialog.Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.DialogContent className="sm:max-w-lg">
        <form
          className="contents"
          onSubmit={(submitted) => {
            submitted.preventDefault()
            if (span !== undefined) move.mutate({ path: { id: block.id }, body: span })
          }}
        >
          <Dialog.DialogHeader>
            <Dialog.DialogTitle>{t("blockMove.title")}</Dialog.DialogTitle>
            <Dialog.DialogDescription>{block.title}</Dialog.DialogDescription>
          </Dialog.DialogHeader>
          <Dialog.DialogBody className="grid grid-cols-[2fr_1fr_1fr] gap-3">
            <Field label={t("event.day")}>
              <Input.Input
                type="date"
                required
                value={form.day}
                onChange={(event) => set({ day: event.target.value })}
              />
            </Field>
            <Field label={t("event.start")}>
              <Input.Input
                type="time"
                step={300}
                required
                value={form.start}
                onChange={(event) => set({ start: event.target.value })}
              />
            </Field>
            <Field label={t("event.end")}>
              <Input.Input
                type="time"
                step={300}
                required
                value={form.end}
                aria-invalid={span === undefined}
                onChange={(event) => set({ end: event.target.value })}
              />
            </Field>
            {span === undefined && (
              <p className="col-span-full text-sm text-destructive" role="alert">
                {t("blockMove.endBeforeStart")}
              </p>
            )}
          </Dialog.DialogBody>
          <Dialog.DialogFooter>
            <Button.Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("event.close")}
            </Button.Button>
            <Button.Button type="submit" disabled={span === undefined || move.isPending}>
              {t("blockMove.submit")}
            </Button.Button>
          </Dialog.DialogFooter>
        </form>
      </Dialog.DialogContent>
    </Dialog.Dialog>
  )
}
