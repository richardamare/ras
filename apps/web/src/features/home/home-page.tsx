import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"

import * as Button from "@/components/ui/button"
import * as Card from "@/components/ui/card"
import * as Skeleton from "@/components/ui/skeleton"
import * as Summary from "@/features/home/summary"
import * as Work from "@/features/tasks/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import type * as Api from "@/lib/api/generated/types.gen"
import * as Prague from "@/lib/prague"

/** The Prague local time, ticking every `period` milliseconds. */
const useNow = (period: number) => {
  const [now, setNow] = React.useState(() => Prague.local())
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Prague.local()), period)
    return () => clearInterval(timer)
  }, [period])
  return now
}

function Count({ label, value, tone }: { label: string; value: number; tone?: "warning" }) {
  return (
    <Card.Card size="sm">
      <Card.CardContent className="grid gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span
          className={`text-2xl font-semibold tabular-nums ${tone === "warning" && value > 0 ? "text-destructive" : ""}`}
        >
          {value}
        </span>
      </Card.CardContent>
    </Card.Card>
  )
}

function Running() {
  const { t } = ReactI18next.useTranslation("Home")
  const client = ReactQuery.useQueryClient()
  const now = useNow(30_000)
  const running = ReactQuery.useQuery(Queries.workRunningOptions())
  const stop = ReactQuery.useMutation({
    ...Queries.workStopMutation(),
    onSuccess: () => client.invalidateQueries(),
    onError: (error) => Sonner.toast.error(Work.reasonOf(error) ?? t("stopFailed"))
  })
  const block = running.data ?? null

  return (
    <Card.Card>
      <Card.CardContent className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <span className="shrink-0 text-sm font-semibold">{t("running.title")}</span>
        {running.isPending ? (
          <Skeleton.Skeleton className="h-8 flex-1" />
        ) : block === null ? (
          <span className="text-sm text-muted-foreground">{t("running.none")}</span>
        ) : (
          <>
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-primary" aria-hidden />
            <span className="min-w-0 truncate font-medium">{block.title}</span>
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
              {Prague.duration(Math.max(0, Prague.minutesBetween(block.start, now)))}
            </span>
            <Button.Button className="ms-auto shrink-0" disabled={stop.isPending} onClick={() => stop.mutate({})}>
              <LucideReact.SquareIcon />
              {t("running.stop")}
            </Button.Button>
          </>
        )}
      </Card.CardContent>
    </Card.Card>
  )
}

function TaskList({ title, tasks, empty }: { title: string; tasks: Api.TaskSummaryEncoded[]; empty: string }) {
  const { t } = ReactI18next.useTranslation("Work")
  return (
    <Card.Card size="sm">
      <Card.CardHeader>
        <Card.CardTitle>{title}</Card.CardTitle>
      </Card.CardHeader>
      <Card.CardContent>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="grid gap-2">
            {tasks.map((task) => (
              <li key={task.id} className="flex min-w-0 items-center gap-2 text-sm">
                <span className="min-w-0 truncate">{task.title}</span>
                <span className="ms-auto shrink-0 text-muted-foreground">
                  {t(`status.${task.status}`)}
                  {task.assignee === "owner" ? "" : ` · ${task.assignee}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card.CardContent>
    </Card.Card>
  )
}

export function HomePage() {
  const { t } = ReactI18next.useTranslation("Home")
  const today = useNow(60_000).slice(0, 10)
  const tasks = ReactQuery.useQuery(Queries.workTasksOptions())
  const result = Summary.summary(tasks.data ?? [], today)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <Running />
      {tasks.isPending ? (
        <Skeleton.Skeleton className="h-24 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Count label={t("counts.open")} value={result.open} />
            <Count label={t("counts.overdue")} value={result.overdue} tone="warning" />
            <Count label={t("counts.inReview")} value={result.inReview} />
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <div className="grid gap-4">
              <TaskList title={t("deadlines.today")} tasks={result.deadlines.today} empty={t("deadlines.none")} />
              <TaskList title={t("deadlines.tomorrow")} tasks={result.deadlines.tomorrow} empty={t("deadlines.none")} />
              <TaskList title={t("deadlines.thisWeek")} tasks={result.deadlines.thisWeek} empty={t("deadlines.none")} />
            </div>
            <TaskList title={t("waiting.title")} tasks={result.waiting} empty={t("waiting.none")} />
          </div>
        </>
      )}
    </div>
  )
}
