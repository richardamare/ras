import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as ReactI18next from "react-i18next"

import * as Badge from "@/components/ui/badge"
import * as Card from "@/components/ui/card"
import * as Skeleton from "@/components/ui/skeleton"
import * as Progress from "@/features/projects/progress"
import * as TaskSheet from "@/features/tasks/task-sheet"
import * as Time from "@/features/tasks-table/time"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import type * as Api from "@/lib/api/generated/types.gen"
import * as Prague from "@/lib/prague"

export function ProjectPage({ id }: { id: string }) {
  const { t } = ReactI18next.useTranslation("Work")
  const project = ReactQuery.useQuery(Queries.workProjectOptions({ path: { id } }))
  const blocks = ReactQuery.useQuery(
    Queries.workBlocksOptions({ query: { from: `${Prague.today()}T00:00`, to: Time.span.to } })
  )
  const [open, setOpen] = React.useState<Api.TaskSummaryEncoded | null>(null)

  if (project.isPending) return <Skeleton.Skeleton className="h-64 w-full" />
  if (project.data === undefined) return <p className="text-sm text-muted-foreground">{t("projects.notFound")}</p>
  const found = project.data
  const upcoming = Progress.upcoming(blocks.data ?? [], new Set(found.tasks.map((task) => task.id)))

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{found.name}</h1>
        <Badge.Badge variant="secondary">{t(`projectStatus.${found.status}`)}</Badge.Badge>
        {found.deadline !== null && (
          <span className="text-sm text-muted-foreground">{t("projects.due", { deadline: found.deadline })}</span>
        )}
        <span className="ms-auto text-sm text-muted-foreground tabular-nums">
          {t("projects.spent", { spent: Prague.duration(found.spent) })}
        </span>
      </div>
      {found.description !== null && <p className="text-sm whitespace-pre-wrap">{found.description}</p>}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card.Card>
          <Card.CardHeader>
            <Card.CardTitle>{t("projects.tasks")}</Card.CardTitle>
          </Card.CardHeader>
          <Card.CardContent className="grid gap-1">
            {found.tasks.length === 0 && <p className="text-sm text-muted-foreground">{t("tasks.none")}</p>}
            {found.tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => setOpen(task)}
                className="flex items-baseline gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
              >
                <span className="me-auto font-medium">{task.title}</span>
                <span className="text-xs text-muted-foreground">
                  {t(`status.${task.status}`)} · {task.assignee === "owner" ? t("owner") : task.assignee}
                  {task.deadline === null ? "" : ` · ${task.deadline}`}
                </span>
              </button>
            ))}
          </Card.CardContent>
        </Card.Card>
        <Card.Card>
          <Card.CardHeader>
            <Card.CardTitle>{t("projects.upcoming")}</Card.CardTitle>
          </Card.CardHeader>
          <Card.CardContent className="grid gap-2">
            {upcoming.length === 0 && <p className="text-sm text-muted-foreground">{t("projects.noBlocks")}</p>}
            {upcoming.map((block) => (
              <div key={block.id} className="grid text-sm">
                <span className="font-medium">{block.title}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {block.start.replace("T", " ")}
                  {block.end === null ? "" : `–${block.end.slice(11)}`}
                  {block.state === "draft" ? ` · ${t("projects.draft")}` : ""}
                </span>
              </div>
            ))}
          </Card.CardContent>
        </Card.Card>
      </div>
      <TaskSheet.TaskSheet id={open?.id ?? null} title={open?.title ?? ""} onClose={() => setOpen(null)} />
    </div>
  )
}
