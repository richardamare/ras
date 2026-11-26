import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as ReactRouter from "@tanstack/react-router"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"

import * as PageHeader from "@/components/page-header"
import * as Badge from "@/components/ui/badge"
import * as Card from "@/components/ui/card"
import * as Skeleton from "@/components/ui/skeleton"
import * as Progress from "@/features/projects/lib/progress"
import * as Completion from "@/features/tasks/components/completion"
import * as UseTaskCompletion from "@/features/tasks/hooks/use-task-completion"
import * as NewTask from "@/features/tasks/components/new-task-dialog"
import * as TaskBits from "@/features/tasks/components/task-bits"
import * as UseDayLabel from "@/features/tasks/hooks/use-day-label"
import * as Time from "@/features/tasks-table/lib/time"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import * as Prague from "@/lib/prague"
import * as Utils from "@/lib/utils"
import * as UseOpenTask from "@/features/tasks/hooks/use-open-task"

export function ProjectPage({ id }: { id: string }) {
  const { t } = ReactI18next.useTranslation("Work")
  const dayLabel = UseDayLabel.useDayLabel()
  const project = ReactQuery.useQuery(Queries.workProjectOptions({ path: { id } }))
  const blocks = ReactQuery.useQuery(
    Queries.workBlocksOptions({ query: { from: `${Prague.today()}T00:00`, to: Time.span.to } })
  )
  const openTask = UseOpenTask.useOpenTask()
  const completion = UseTaskCompletion.useTaskCompletion()

  if (project.isPending) return <Skeleton.Skeleton className="h-64 w-full" />
  if (project.data === undefined) return <p className="text-sm text-muted-foreground">{t("projects.notFound")}</p>
  const found = project.data
  const upcoming = Progress.upcoming(blocks.data ?? [], new Set(found.tasks.map((task) => task.id)))

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <ReactRouter.Link
          to="/projects"
          className="flex w-fit items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground"
        >
          <LucideReact.ChevronLeftIcon className="size-4" />
          {t("projects.title")}
        </ReactRouter.Link>
        <PageHeader.PageHeader
          title={
            <span className="flex items-center gap-3">
              {found.name}
              <Badge.Badge variant="secondary">{t(`projectStatus.${found.status}`)}</Badge.Badge>
            </span>
          }
        >
          <span className="flex items-center gap-4 text-sm text-muted-foreground">
            {found.deadline !== null && (
              <TaskBits.Due task={{ deadline: found.deadline, status: found.status === "done" ? "done" : "todo" }} />
            )}
            <span className="inline-flex items-center gap-1 tabular-nums">
              <LucideReact.TimerIcon className="size-3.5" aria-hidden="true" />
              {t("projects.spent", { spent: Prague.duration(found.spent) })}
            </span>
          </span>
          <NewTask.NewTaskButton project={found.id} />
        </PageHeader.PageHeader>
      </div>
      {found.description !== null && <p className="text-sm wrap-anywhere whitespace-pre-wrap">{found.description}</p>}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card.Card>
          <Card.CardHeader>
            <Card.CardTitle>{t("projects.tasks")}</Card.CardTitle>
          </Card.CardHeader>
          <Card.CardContent className="grid gap-1">
            {found.tasks.length === 0 && <p className="text-sm text-muted-foreground">{t("tasks.none")}</p>}
            {found.tasks.map((task) => {
              const phase = completion.phaseOf(task.id)
              return (
                <div
                  key={task.id}
                  className={Utils.cn(
                    "-mx-2 flex items-center gap-1 rounded-md ps-2 hover:bg-accent",
                    phase !== undefined && Completion.rowClass[phase]
                  )}
                >
                  <Completion.DoneCheckbox task={task} />
                  <button
                    type="button"
                    onClick={() => openTask(task.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <span className="min-w-0 truncate font-medium">{task.title}</span>
                    <TaskBits.PriorityFlag priority={task.priority} />
                    <span className="ms-auto flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                      <TaskBits.Assignee assignee={task.assignee} />
                      {task.deadline !== null && <TaskBits.Due task={task} />}
                      <TaskBits.StatusBadge status={task.status} />
                    </span>
                  </button>
                </div>
              )
            })}
          </Card.CardContent>
        </Card.Card>
        <Card.Card>
          <Card.CardHeader>
            <Card.CardTitle>{t("projects.upcoming")}</Card.CardTitle>
          </Card.CardHeader>
          <Card.CardContent className="grid gap-2">
            {upcoming.length === 0 && <p className="text-sm text-muted-foreground">{t("projects.noBlocks")}</p>}
            {upcoming.map((block) => (
              <div key={block.id} className="grid gap-0.5 text-sm">
                <span className="font-medium">{block.title}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {`${dayLabel(block.start.slice(0, 10))} ${block.start.slice(11)}`}
                  {block.end === null ? "" : `–${block.end.slice(11)}`}
                  {block.state === "draft" ? ` · ${t("projects.draft")}` : ""}
                </span>
              </div>
            ))}
          </Card.CardContent>
        </Card.Card>
      </div>
    </div>
  )
}
