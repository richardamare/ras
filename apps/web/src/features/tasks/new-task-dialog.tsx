import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"

import * as Button from "@/components/ui/button"
import * as Dialog from "@/components/ui/dialog"
import * as Input from "@/components/ui/input"
import * as Label from "@/components/ui/label"
import * as Select from "@/components/ui/select"
import * as Textarea from "@/components/ui/textarea"
import * as TaskBits from "@/features/tasks/task-bits"
import * as Work from "@/features/tasks/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import * as DialogStore from "@/lib/dialog-store"
import type * as Api from "@/lib/api/generated/types.gen"

const noProject = "none"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Label.Label className="grid gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </Label.Label>
  )
}

interface Preset {
  /** Preselects the project. */
  readonly project?: string
  /** The column the task starts in; left out, the API's default. */
  readonly status?: Work.Status
}

export const useNewTaskDialog = DialogStore.createDialogStore<Preset>()

export function NewTaskButton(preset: Preset) {
  const { t } = ReactI18next.useTranslation("Work")
  const dialog = useNewTaskDialog()
  return (
    <Button.Button onClick={() => dialog.open(preset)}>
      <LucideReact.PlusIcon />
      {t("newTask.button")}
    </Button.Button>
  )
}

export function NewTaskDialog({
  open,
  onOpenChange,
  project,
  status
}: Preset & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = ReactI18next.useTranslation("Work")
  const client = ReactQuery.useQueryClient()
  const projects = ReactQuery.useQuery(Queries.workProjectsOptions())
  const agents = ReactQuery.useQuery(Queries.globalAgentsOptions())
  const [form, setForm] = React.useState({
    title: "",
    project: project ?? noProject,
    assignee: "owner",
    priority: "normal" as Api.TaskSummaryEncoded["priority"],
    deadline: "",
    body: ""
  })
  const set = (change: Partial<typeof form>) => setForm((current) => ({ ...current, ...change }))
  const add = ReactQuery.useMutation({
    ...Queries.workAddTaskMutation(),
    onSuccess: (task) => {
      Sonner.toast.success(t("newTask.added", { title: task.title }))
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
          onSubmit={(event) => {
            event.preventDefault()
            add.mutate({
              body: {
                title: form.title.trim(),
                assignee: form.assignee,
                priority: form.priority,
                ...(status === undefined ? {} : { status }),
                ...(form.project === noProject ? {} : { project: form.project }),
                ...(form.deadline === "" ? {} : { deadline: form.deadline }),
                ...(form.body.trim() === "" ? {} : { body: form.body.trim() })
              }
            })
          }}
        >
          <Dialog.DialogHeader>
            <Dialog.DialogTitle>{t("newTask.title")}</Dialog.DialogTitle>
            <Dialog.DialogDescription>{t("newTask.hint")}</Dialog.DialogDescription>
          </Dialog.DialogHeader>
          <Dialog.DialogBody className="grid gap-4">
            <Field label={t("fields.title")}>
              <Input.Input
                autoFocus
                required
                value={form.title}
                onChange={(event) => set({ title: event.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("fields.project")}>
                <Select.Select value={form.project} onValueChange={(value) => set({ project: value })}>
                  <Select.SelectTrigger className="w-full">
                    <Select.SelectValue />
                  </Select.SelectTrigger>
                  <Select.SelectContent>
                    <Select.SelectItem value={noProject}>{t("newTask.noProject")}</Select.SelectItem>
                    {(projects.data ?? [])
                      .filter((one) => one.status !== "done")
                      .map((one) => (
                        <Select.SelectItem key={one.id} value={one.id}>
                          {one.name}
                        </Select.SelectItem>
                      ))}
                  </Select.SelectContent>
                </Select.Select>
              </Field>
              <Field label={t("fields.assignee")}>
                <Select.Select value={form.assignee} onValueChange={(value) => set({ assignee: value })}>
                  <Select.SelectTrigger className="w-full">
                    <Select.SelectValue />
                  </Select.SelectTrigger>
                  <Select.SelectContent>
                    {[
                      "owner",
                      ...(agents.data ?? []).filter((agent) => !agent.archived).map((agent) => agent.slug)
                    ].map((person) => (
                      <Select.SelectItem key={person} value={person}>
                        <TaskBits.Assignee assignee={person} />
                      </Select.SelectItem>
                    ))}
                  </Select.SelectContent>
                </Select.Select>
              </Field>
              <Field label={t("fields.priority")}>
                <Select.Select
                  value={form.priority}
                  onValueChange={(value) => set({ priority: value as typeof form.priority })}
                >
                  <Select.SelectTrigger className="w-full">
                    <Select.SelectValue />
                  </Select.SelectTrigger>
                  <Select.SelectContent>
                    {Work.priorities.map((priority) => (
                      <Select.SelectItem key={priority} value={priority}>
                        {t(`priority.${priority}`)}
                      </Select.SelectItem>
                    ))}
                  </Select.SelectContent>
                </Select.Select>
              </Field>
              <Field label={t("fields.deadline")}>
                <Input.Input
                  type="date"
                  className="w-full"
                  value={form.deadline}
                  onChange={(event) => set({ deadline: event.target.value })}
                />
              </Field>
            </div>
            <Field label={t("newTask.body")}>
              <Textarea.Textarea rows={4} value={form.body} onChange={(event) => set({ body: event.target.value })} />
            </Field>
          </Dialog.DialogBody>
          <Dialog.DialogFooter>
            <Button.Button type="submit" disabled={form.title.trim() === "" || add.isPending}>
              {t("newTask.create")}
            </Button.Button>
          </Dialog.DialogFooter>
        </form>
      </Dialog.DialogContent>
    </Dialog.Dialog>
  )
}
