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
import * as Work from "@/features/tasks/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
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

/** A button that opens a form for a new task; `project` preselects the project. */
export function NewTaskButton({ project, status }: { project?: string; status?: Work.Status }) {
  const { t } = ReactI18next.useTranslation("Work")
  const client = ReactQuery.useQueryClient()
  const projects = ReactQuery.useQuery(Queries.workProjectsOptions())
  const agents = ReactQuery.useQuery(Queries.globalAgentsOptions())
  const [open, setOpen] = React.useState(false)
  const blank = {
    title: "",
    project: project ?? noProject,
    assignee: "owner",
    priority: "normal" as Api.TaskSummaryEncoded["priority"],
    deadline: "",
    body: ""
  }
  const [form, setForm] = React.useState(blank)
  const set = (change: Partial<typeof blank>) => setForm((current) => ({ ...current, ...change }))
  const add = ReactQuery.useMutation({
    ...Queries.workAddTaskMutation(),
    onSuccess: (task) => {
      Sonner.toast.success(t("newTask.added", { title: task.title }))
      setOpen(false)
      setForm(blank)
      return client.invalidateQueries()
    },
    onError: (error) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  })

  return (
    <Dialog.Dialog open={open} onOpenChange={setOpen}>
      <Dialog.DialogTrigger asChild>
        <Button.Button>
          <LucideReact.PlusIcon />
          {t("newTask.button")}
        </Button.Button>
      </Dialog.DialogTrigger>
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
                    <Select.SelectItem value="owner">{t("owner")}</Select.SelectItem>
                    {(agents.data ?? [])
                      .filter((agent) => !agent.archived)
                      .map((agent) => (
                        <Select.SelectItem key={agent.slug} value={agent.slug}>
                          {agent.name}
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
