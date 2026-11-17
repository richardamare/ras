import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as ReactI18next from "react-i18next"

import * as Skeleton from "@/components/ui/skeleton"
import * as Table from "@/components/ui/table"
import * as TaskSheet from "@/features/tasks/task-sheet"
import * as Time from "@/features/tasks-table/time"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import type * as Api from "@/lib/api/generated/types.gen"
import * as Prague from "@/lib/prague"

const when = (local: string) => local.replace("T", " ")

export function TasksPage() {
  const { t } = ReactI18next.useTranslation("Work")
  const tasks = ReactQuery.useQuery(Queries.workTasksOptions())
  const projects = ReactQuery.useQuery(Queries.workProjectsOptions())
  const blocks = ReactQuery.useQuery(Queries.workBlocksOptions({ query: Time.span }))
  const [open, setOpen] = React.useState<Api.TaskSummaryEncoded | null>(null)

  const projectNames = new Map((projects.data ?? []).map((one) => [one.id, one.name]))
  const times = Time.timeOf(blocks.data ?? [])

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("tasks.title")}</h1>
      {tasks.isPending ? (
        <Skeleton.Skeleton className="h-64 w-full" />
      ) : (tasks.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("tasks.none")}</p>
      ) : (
        <Table.Table>
          <Table.TableHeader>
            <Table.TableRow>
              <Table.TableHead>{t("fields.title")}</Table.TableHead>
              <Table.TableHead>{t("fields.project")}</Table.TableHead>
              <Table.TableHead>{t("fields.assignee")}</Table.TableHead>
              <Table.TableHead>{t("fields.status")}</Table.TableHead>
              <Table.TableHead>{t("fields.priority")}</Table.TableHead>
              <Table.TableHead>{t("fields.deadline")}</Table.TableHead>
              <Table.TableHead className="text-right">{t("fields.spent")}</Table.TableHead>
              <Table.TableHead>{t("fields.next")}</Table.TableHead>
            </Table.TableRow>
          </Table.TableHeader>
          <Table.TableBody>
            {(tasks.data ?? []).map((task) => {
              const time = times.get(task.id)
              return (
                <Table.TableRow key={task.id} className="cursor-pointer" onClick={() => setOpen(task)}>
                  <Table.TableCell className="font-medium">{task.title}</Table.TableCell>
                  <Table.TableCell>{task.project === null ? "—" : projectNames.get(task.project)}</Table.TableCell>
                  <Table.TableCell>{task.assignee === "owner" ? t("owner") : task.assignee}</Table.TableCell>
                  <Table.TableCell>{t(`status.${task.status}`)}</Table.TableCell>
                  <Table.TableCell>{t(`priority.${task.priority}`)}</Table.TableCell>
                  <Table.TableCell className="tabular-nums">{task.deadline ?? "—"}</Table.TableCell>
                  <Table.TableCell className="text-right tabular-nums">
                    {Prague.duration(time?.spent ?? 0)}
                  </Table.TableCell>
                  <Table.TableCell className="tabular-nums">
                    {time?.next == null ? "—" : when(time.next)}
                  </Table.TableCell>
                </Table.TableRow>
              )
            })}
          </Table.TableBody>
        </Table.Table>
      )}
      <TaskSheet.TaskSheet id={open?.id ?? null} title={open?.title ?? ""} onClose={() => setOpen(null)} />
    </div>
  )
}
