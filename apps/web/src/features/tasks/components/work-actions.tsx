import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"

import * as IconButton from "@/components/icon-button"
import * as Button from "@/components/ui/button"
import * as Dialog from "@/components/ui/dialog"
import * as DropdownMenu from "@/components/ui/dropdown-menu"
import * as Input from "@/components/ui/input"
import * as Label from "@/components/ui/label"
import * as Completion from "@/features/tasks/components/completion"
import * as TaskEdit from "@/features/tasks/components/task-edit"
import * as TaskUrl from "@/features/tasks/lib/url"
import * as Work from "@/features/tasks/lib/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import type * as Api from "@/lib/api/generated/types.gen"
import * as DialogStore from "@/lib/dialog-store"
import * as Prague from "@/lib/prague"

type Target = Pick<Api.TaskSummaryEncoded, "id" | "title" | "status">

const useSettled = () => {
  const { t } = ReactI18next.useTranslation("Work")
  const client = ReactQuery.useQueryClient()
  return {
    onSuccess: () => client.invalidateQueries(),
    onError: (error: unknown) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  }
}

/** Starting and stopping the clock on a task. Only one block runs at a time, and the API refuses a second. */
export const useClock = () => {
  const settled = useSettled()
  const running = ReactQuery.useQuery(Queries.workRunningOptions())
  const start = ReactQuery.useMutation({ ...Queries.workStartMutation(), ...settled })
  const stop = ReactQuery.useMutation({ ...Queries.workStopMutation(), ...settled })
  const block = running.data ?? null
  return {
    runs: (task: string) => block?.task === task,
    start: (task: string) => start.mutate({ body: { task } }),
    stop: () => stop.mutate({}),
    busy: start.isPending || stop.isPending
  }
}

export const useBlockDialog = DialogStore.createDialogStore<{ task: Pick<Target, "id" | "title"> }>()

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Label.Label className="grid gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </Label.Label>
  )
}

/** Adds a block of work on the task, in the past, the future or across now, to its space's calendar. */
export function BlockDialog({
  task,
  open,
  onOpenChange
}: {
  task: Pick<Target, "id" | "title">
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = ReactI18next.useTranslation("Work")
  const settled = useSettled()
  const [form, setForm] = React.useState(() => Work.blockDefaults(Prague.local()))
  const set = (change: Partial<typeof form>) => setForm((current) => ({ ...current, ...change }))
  const add = ReactQuery.useMutation({
    ...Queries.workAddMutation(),
    ...settled,
    onSuccess: () => {
      Sonner.toast.success(t("block.added", { title: task.title }))
      onOpenChange(false)
      return settled.onSuccess()
    }
  })
  const start = `${form.date}T${form.from}`
  const end = `${form.date}T${form.to}`
  const minutes = form.date === "" || form.from === "" || form.to === "" ? 0 : Prague.minutesBetween(start, end)

  return (
    <Dialog.Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.DialogContent className="sm:max-w-md">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault()
            add.mutate({ body: { task: task.id, start, end } })
          }}
        >
          <Dialog.DialogHeader>
            <Dialog.DialogTitle>{t("block.title", { title: task.title })}</Dialog.DialogTitle>
            <Dialog.DialogDescription>{t("block.hint")}</Dialog.DialogDescription>
          </Dialog.DialogHeader>
          <Dialog.DialogBody className="grid gap-3">
            <div className="grid grid-cols-3 gap-3">
              <Field label={t("work.date")}>
                <Input.Input type="date" required value={form.date} onChange={(e) => set({ date: e.target.value })} />
              </Field>
              <Field label={t("work.from")}>
                <Input.Input
                  type="time"
                  required
                  step={300}
                  value={form.from}
                  onChange={(e) => set({ from: e.target.value })}
                />
              </Field>
              <Field label={t("work.to")}>
                <Input.Input
                  type="time"
                  required
                  step={300}
                  value={form.to}
                  onChange={(e) => set({ to: e.target.value })}
                />
              </Field>
            </div>
            <p className={minutes > 0 ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
              {minutes > 0 ? t("block.length", { length: Prague.duration(minutes) }) : t("block.badSpan")}
            </p>
          </Dialog.DialogBody>
          <Dialog.DialogFooter>
            <Button.Button type="submit" disabled={minutes <= 0 || add.isPending}>
              {t("block.submit")}
            </Button.Button>
          </Dialog.DialogFooter>
        </form>
      </Dialog.DialogContent>
    </Dialog.Dialog>
  )
}

/** Start or stop and add a block, as a row of buttons for an open task. */
export function WorkButtons({ task }: { task: Target }) {
  const { t } = ReactI18next.useTranslation("Work")
  const clock = useClock()
  const blockDialog = useBlockDialog()
  const runs = clock.runs(task.id)
  if (task.status === "done" && !runs) return null

  return (
    <div className="flex flex-wrap gap-2">
      {runs ? (
        <Button.Button size="sm" disabled={clock.busy} onClick={clock.stop}>
          <LucideReact.SquareIcon />
          {t("work.stop")}
        </Button.Button>
      ) : (
        <Button.Button size="sm" disabled={clock.busy} onClick={() => clock.start(task.id)}>
          <LucideReact.PlayIcon />
          {t("work.start")}
        </Button.Button>
      )}
      <Button.Button size="sm" variant="outline" onClick={() => blockDialog.open({ task })}>
        <LucideReact.CalendarPlusIcon />
        {t("block.button")}
      </Button.Button>
    </div>
  )
}

/** Every action on a task from a row's menu: the clock, adding a block, opening, closing and deleting it. */
export function TaskMenu({ task }: { task: Target }) {
  const { t } = ReactI18next.useTranslation("Work")
  const clock = useClock()
  const completion = Completion.useTaskCompletion()
  const blockDialog = useBlockDialog()
  const openTask = TaskUrl.useOpenTask()
  const remove = TaskEdit.useDeleteTask()
  const open = task.status !== "done"
  const runs = clock.runs(task.id)

  return (
    <span onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <DropdownMenu.DropdownMenu>
        <DropdownMenu.DropdownMenuTrigger asChild>
          <IconButton.IconButton label={t("menu.label", { title: task.title })} className="size-7">
            <LucideReact.EllipsisIcon />
          </IconButton.IconButton>
        </DropdownMenu.DropdownMenuTrigger>
        <DropdownMenu.DropdownMenuContent align="end" className="w-auto min-w-44 whitespace-nowrap">
          {runs && (
            <DropdownMenu.DropdownMenuItem onSelect={clock.stop}>
              <LucideReact.SquareIcon />
              {t("work.stop")}
            </DropdownMenu.DropdownMenuItem>
          )}
          {open && !runs && (
            <DropdownMenu.DropdownMenuItem onSelect={() => clock.start(task.id)}>
              <LucideReact.PlayIcon />
              {t("work.start")}
            </DropdownMenu.DropdownMenuItem>
          )}
          {open && (
            <>
              <DropdownMenu.DropdownMenuItem onSelect={() => blockDialog.open({ task })}>
                <LucideReact.CalendarPlusIcon />
                {t("block.button")}
              </DropdownMenu.DropdownMenuItem>
              <DropdownMenu.DropdownMenuSeparator />
            </>
          )}
          <DropdownMenu.DropdownMenuItem onSelect={() => openTask(task.id)}>
            <LucideReact.PencilIcon />
            {t("menu.open")}
          </DropdownMenu.DropdownMenuItem>
          <DropdownMenu.DropdownMenuItem onSelect={() => completion.toggle(task)}>
            {open ? <LucideReact.CheckIcon /> : <LucideReact.RotateCcwIcon />}
            {open ? t("completion.done") : t("completion.reopen")}
          </DropdownMenu.DropdownMenuItem>
          <DropdownMenu.DropdownMenuSeparator />
          <DropdownMenu.DropdownMenuItem variant="destructive" onSelect={() => remove(task)}>
            <LucideReact.Trash2Icon />
            {t("delete.button")}
          </DropdownMenu.DropdownMenuItem>
        </DropdownMenu.DropdownMenuContent>
      </DropdownMenu.DropdownMenu>
    </span>
  )
}
