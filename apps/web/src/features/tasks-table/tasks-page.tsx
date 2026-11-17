import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as ReactRouter from "@tanstack/react-router"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"

import * as PageHeader from "@/components/page-header"
import * as Input from "@/components/ui/input"
import * as Select from "@/components/ui/select"
import * as Skeleton from "@/components/ui/skeleton"
import * as Table from "@/components/ui/table"
import * as NewTask from "@/features/tasks/new-task-dialog"
import * as TaskBits from "@/features/tasks/task-bits"
import * as TaskDialog from "@/features/tasks/task-dialog"
import * as Work from "@/features/tasks/work"
import * as Time from "@/features/tasks-table/time"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import type * as Api from "@/lib/api/generated/types.gen"
import * as Prague from "@/lib/prague"

const open = "open"
const all = "all"

export function TasksPage() {
  const { t } = ReactI18next.useTranslation("Work")
  const dayLabel = TaskBits.useDayLabel()
  const tasks = ReactQuery.useQuery(Queries.workTasksOptions())
  const projects = ReactQuery.useQuery(Queries.workProjectsOptions())
  const blocks = ReactQuery.useQuery(Queries.workBlocksOptions({ query: Time.span }))
  const [shown, setShown] = React.useState<Api.TaskSummaryEncoded | null>(null)
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState<string>(open)

  const projectNames = new Map((projects.data ?? []).map((one) => [one.id, one.name]))
  const times = Time.timeOf(blocks.data ?? [])
  const term = search.trim().toLowerCase()
  const rows = (tasks.data ?? []).filter(
    (task) =>
      (status === all || (status === open ? task.status !== "done" : task.status === status)) &&
      (term === "" || task.title.toLowerCase().includes(term))
  )

  return (
    <div className="grid gap-4">
      <PageHeader.PageHeader title={t("tasks.title")}>
        <div className="relative">
          <LucideReact.SearchIcon className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input.Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("tasks.search")}
            aria-label={t("tasks.search")}
            className="w-56 ps-8"
          />
        </div>
        <Select.Select value={status} onValueChange={setStatus}>
          <Select.SelectTrigger aria-label={t("fields.status")} className="min-w-40">
            <Select.SelectValue />
          </Select.SelectTrigger>
          <Select.SelectContent>
            <Select.SelectItem value={open}>{t("tasks.open")}</Select.SelectItem>
            <Select.SelectItem value={all}>{t("tasks.all")}</Select.SelectItem>
            <Select.SelectSeparator />
            {Work.statuses.map((one) => (
              <Select.SelectItem key={one} value={one}>
                {t(`status.${one}`)}
              </Select.SelectItem>
            ))}
          </Select.SelectContent>
        </Select.Select>
        <NewTask.NewTaskButton />
      </PageHeader.PageHeader>
      {tasks.isPending ? (
        <Skeleton.Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {(tasks.data ?? []).length === 0 ? t("tasks.none") : t("tasks.noMatch")}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table.Table>
            <Table.TableHeader className="bg-muted/50">
              <Table.TableRow>
                <Table.TableHead className="ps-4">{t("fields.title")}</Table.TableHead>
                <Table.TableHead>{t("fields.project")}</Table.TableHead>
                <Table.TableHead>{t("fields.assignee")}</Table.TableHead>
                <Table.TableHead>{t("fields.status")}</Table.TableHead>
                <Table.TableHead>{t("fields.deadline")}</Table.TableHead>
                <Table.TableHead className="text-right">{t("fields.spent")}</Table.TableHead>
                <Table.TableHead className="pe-4">{t("fields.next")}</Table.TableHead>
              </Table.TableRow>
            </Table.TableHeader>
            <Table.TableBody>
              {rows.map((task) => {
                const time = times.get(task.id)
                return (
                  <Table.TableRow
                    key={task.id}
                    tabIndex={0}
                    className="cursor-pointer outline-none focus-visible:bg-accent"
                    onClick={() => setShown(task)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") setShown(task)
                    }}
                  >
                    <Table.TableCell className="ps-4 font-medium">
                      <span className="flex items-center gap-2">
                        {task.title}
                        <TaskBits.PriorityFlag priority={task.priority} />
                      </span>
                    </Table.TableCell>
                    <Table.TableCell>
                      {task.project === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <ReactRouter.Link
                          to="/projects/$id"
                          params={{ id: task.project }}
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-sm underline-offset-4 hover:underline"
                        >
                          {projectNames.get(task.project)}
                        </ReactRouter.Link>
                      )}
                    </Table.TableCell>
                    <Table.TableCell>
                      <TaskBits.Assignee assignee={task.assignee} />
                    </Table.TableCell>
                    <Table.TableCell>
                      <TaskBits.StatusBadge status={task.status} />
                    </Table.TableCell>
                    <Table.TableCell>
                      <TaskBits.Due task={task} />
                    </Table.TableCell>
                    <Table.TableCell className="text-right tabular-nums">
                      {(time?.spent ?? 0) === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        Prague.duration(time?.spent ?? 0)
                      )}
                    </Table.TableCell>
                    <Table.TableCell className="pe-4 tabular-nums">
                      {time?.next == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        `${dayLabel(time.next.slice(0, 10))} ${time.next.slice(11)}`
                      )}
                    </Table.TableCell>
                  </Table.TableRow>
                )
              })}
            </Table.TableBody>
          </Table.Table>
        </div>
      )}
      <TaskDialog.TaskDialog id={shown?.id ?? null} title={shown?.title ?? ""} onClose={() => setShown(null)} />
    </div>
  )
}
