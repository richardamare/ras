import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as Nuqs from "nuqs"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"

import * as Combobox from "@/components/combobox"
import * as Skeleton from "@/components/ui/skeleton"
import * as PageHeader from "@/components/page-header"
import * as Columns from "@/features/board/lib/columns"
import * as MoveDialog from "@/features/board/components/move-dialog"
import * as NewTask from "@/features/tasks/components/new-task-dialog"
import * as TaskBits from "@/features/tasks/components/task-bits"
import * as Work from "@/features/tasks/lib/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import type * as Api from "@/lib/api/generated/types.gen"
import * as Utils from "@/lib/utils"
import * as TaskUrl from "@/features/tasks/lib/url"

type Task = Api.TaskSummaryEncoded

const all = "all"

function Filter({
  label,
  value,
  onChange,
  options
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: ReadonlyArray<Combobox.Option>
}) {
  const { t } = ReactI18next.useTranslation("Work")
  return (
    <Combobox.Combobox
      label={label}
      value={value}
      onChange={onChange}
      options={[{ value: all, label: t("board.all", { what: label }) }, ...options]}
      className="min-w-40"
    />
  )
}

function Card({ task, projects, onOpen }: { task: Task; projects: Map<string, string>; onOpen: () => void }) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => event.dataTransfer.setData("text/plain", task.id)}
      onClick={onOpen}
      className="grid w-full cursor-grab gap-2 rounded-lg border bg-card p-3 text-left text-sm shadow-xs transition-colors outline-none hover:border-primary/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 active:cursor-grabbing"
    >
      <span className="flex items-start gap-2">
        <span className="me-auto leading-snug font-medium">{task.title}</span>
        <TaskBits.PriorityFlag priority={task.priority} />
      </span>
      {task.project !== null && (
        <span className="w-fit rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {projects.get(task.project)}
        </span>
      )}
      <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <TaskBits.Assignee assignee={task.assignee} />
        {task.deadline !== null && <TaskBits.Due task={task} />}
      </span>
    </button>
  )
}

export function BoardPage() {
  const { t } = ReactI18next.useTranslation("Work")
  const client = ReactQuery.useQueryClient()
  const [{ assignee, space, project }, setFilters] = Nuqs.useQueryStates({
    assignee: Nuqs.parseAsString.withDefault(all),
    space: Nuqs.parseAsString.withDefault(all),
    project: Nuqs.parseAsString.withDefault(all)
  })
  const [over, setOver] = React.useState<Work.Status | null>(null)
  const moveDialog = MoveDialog.useMoveDialog()
  const openTask = TaskUrl.useOpenTask()

  const query = {
    ...(assignee === all ? {} : { assignee }),
    ...(space === all ? {} : { space }),
    ...(project === all ? {} : { project })
  }
  const tasks = ReactQuery.useQuery(Queries.workTasksOptions({ query }))
  const agents = ReactQuery.useQuery(Queries.globalAgentsOptions())
  const spaces = ReactQuery.useQuery(Queries.workSpacesOptions())
  const projects = ReactQuery.useQuery(Queries.workProjectsOptions())
  const projectNames = new Map((projects.data ?? []).map((one) => [one.id, one.name]))

  const change = ReactQuery.useMutation({
    ...Queries.workChangeTaskMutation(),
    onSuccess: () => client.invalidateQueries(),
    onError: (error) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  })

  const drop = (status: Work.Status, id: string) => {
    setOver(null)
    const task = (tasks.data ?? []).find((one) => one.id === id)
    if (task === undefined || task.status === status) return
    if (Work.explained.includes(status)) moveDialog.open({ task, status })
    else change.mutate({ path: { id }, body: { status } })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <PageHeader.PageHeader title={t("board.title")}>
        <Filter
          label={t("fields.assignee")}
          value={assignee}
          onChange={(value) => void setFilters({ assignee: value })}
          options={[
            { value: "owner", label: t("owner") },
            ...(agents.data ?? []).map((agent) => ({ value: agent.slug, label: agent.name }))
          ]}
        />
        <Filter
          label={t("fields.space")}
          value={space}
          onChange={(value) => {
            void setFilters({ space: value, project: null })
          }}
          options={(spaces.data ?? [])
            .filter((one) => !one.archived)
            .map((one) => ({ value: one.id, label: one.name }))}
        />
        <Filter
          label={t("fields.project")}
          value={project}
          onChange={(value) => void setFilters({ project: value })}
          options={(projects.data ?? [])
            .filter((one) => space === all || one.space === space)
            .map((one) => ({ value: one.id, label: one.name }))}
        />
        <NewTask.NewTaskButton {...(project === all ? {} : { project })} />
      </PageHeader.PageHeader>
      {tasks.isPending ? (
        <Skeleton.Skeleton className="h-64 w-full" />
      ) : (
        <div className="-mx-1 grid min-h-0 flex-1 auto-cols-[minmax(11rem,1fr)] grid-flow-col grid-rows-[minmax(0,1fr)] gap-3 overflow-x-auto px-1 pt-1 pb-3">
          {Columns.columns(tasks.data ?? []).map((column) => (
            <section
              key={column.status}
              aria-label={t(`status.${column.status}`)}
              onDragOver={(event) => {
                event.preventDefault()
                setOver(column.status)
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(event) => {
                event.preventDefault()
                drop(column.status, event.dataTransfer.getData("text/plain"))
              }}
              className={Utils.cn(
                "flex min-h-0 flex-col gap-2 rounded-xl border border-transparent bg-muted/60 p-2 transition-colors",
                over === column.status && "border-dashed border-primary/50 bg-accent/60"
              )}
            >
              <h2 className="flex items-center justify-between gap-2 px-1 pt-0.5 text-sm font-semibold">
                {t(`status.${column.status}`)}
                <span className="rounded-full bg-background px-1.5 text-xs font-medium text-muted-foreground tabular-nums">
                  {column.tasks.length}
                </span>
              </h2>
              <div className="-mx-2 -mb-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pt-0.5 pb-2">
                {column.tasks.length === 0 && (
                  <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                    {t("board.empty")}
                  </p>
                )}
                {column.tasks.map((task) => (
                  <Card key={task.id} task={task} projects={projectNames} onOpen={() => openTask(task.id)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
