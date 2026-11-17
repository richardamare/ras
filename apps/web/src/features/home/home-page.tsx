import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as ReactRouter from "@tanstack/react-router"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"

import * as PageHeader from "@/components/page-header"
import * as Button from "@/components/ui/button"
import * as Card from "@/components/ui/card"
import * as Skeleton from "@/components/ui/skeleton"
import * as Summary from "@/features/home/summary"
import * as TaskBits from "@/features/tasks/task-bits"
import * as TaskDialog from "@/features/tasks/task-dialog"
import * as Work from "@/features/tasks/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import type * as Api from "@/lib/api/generated/types.gen"
import * as Prague from "@/lib/prague"
import * as Utils from "@/lib/utils"

/** The Prague local time, ticking every `period` milliseconds. */
const useNow = (period: number) => {
  const [now, setNow] = React.useState(() => Prague.local())
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Prague.local()), period)
    return () => clearInterval(timer)
  }, [period])
  return now
}

function Count({
  label,
  value,
  to,
  alarm = false
}: {
  label: string
  value: number
  to: "/tasks" | "/board"
  alarm?: boolean
}) {
  return (
    <ReactRouter.Link to={to} className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
      <Card.Card size="sm" className="transition-colors group-hover:border-primary/40">
        <Card.CardContent className="grid gap-1">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className={Utils.cn("text-3xl font-semibold tabular-nums", alarm && value > 0 && "text-destructive")}>
            {value}
          </span>
        </Card.CardContent>
      </Card.Card>
    </ReactRouter.Link>
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

function TaskRows({
  tasks,
  onOpen
}: {
  tasks: ReadonlyArray<Api.TaskSummaryEncoded>
  onOpen: (task: Api.TaskSummaryEncoded) => void
}) {
  return (
    <ul className="-mx-2 grid">
      {tasks.map((task) => (
        <li key={task.id}>
          <button
            type="button"
            onClick={() => onOpen(task)}
            className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <span className="min-w-0 truncate font-medium">{task.title}</span>
            <TaskBits.PriorityFlag priority={task.priority} />
            <span className="ms-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              {task.assignee !== "owner" && <TaskBits.Assignee assignee={task.assignee} />}
              <TaskBits.StatusBadge status={task.status} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function Group({
  title,
  tasks,
  onOpen
}: {
  title: string
  tasks: ReadonlyArray<Api.TaskSummaryEncoded>
  onOpen: (task: Api.TaskSummaryEncoded) => void
}) {
  if (tasks.length === 0) return null
  return (
    <section className="grid gap-1">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      <TaskRows tasks={tasks} onOpen={onOpen} />
    </section>
  )
}

/** Today's events and work blocks in time order, from the calendars that are shown. */
function Agenda({ today }: { today: string }) {
  const { t } = ReactI18next.useTranslation("Home")
  const span = { from: `${today}T00:00`, to: `${Prague.addDays(today, 1)}T00:00` }
  const events = ReactQuery.useQuery(Queries.calendarEventsOptions({ query: span }))
  const blocks = ReactQuery.useQuery(Queries.workBlocksOptions({ query: span }))
  const calendars = ReactQuery.useQuery(Queries.calendarCalendarsOptions())
  const colors = new Map((calendars.data ?? []).map((calendar) => [calendar.id, calendar.color]))
  const items = [
    ...(events.data ?? [])
      .filter((event) => event.block === null && !event.cancelled)
      .map((event) => ({
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        allDay: event.allDay,
        calendar: event.calendar,
        block: false
      })),
    ...(blocks.data ?? []).map((block) => ({
      id: block.id,
      title: block.title,
      start: block.start,
      end: block.end ?? block.start,
      allDay: false,
      calendar: block.calendar,
      block: true
    }))
  ].toSorted((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start))

  return (
    <Card.Card size="sm">
      <Card.CardHeader className="flex flex-row items-center justify-between">
        <Card.CardTitle>{t("agenda.title")}</Card.CardTitle>
        <ReactRouter.Link
          to="/calendar"
          search={{ view: "day" }}
          className="rounded-sm text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("agenda.open")}
        </ReactRouter.Link>
      </Card.CardHeader>
      <Card.CardContent>
        {events.isPending || blocks.isPending ? (
          <Skeleton.Skeleton className="h-24" />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("agenda.none")}</p>
        ) : (
          <ul className="grid gap-1.5">
            {items.map((item) => (
              <li key={item.id} className="flex min-w-0 items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">
                  {item.allDay ? t("agenda.allDay") : `${item.start.slice(11)}–${item.end.slice(11)}`}
                </span>
                <span
                  className={Utils.cn("size-2 shrink-0 rounded-full", item.block && "rounded-sm")}
                  style={{ backgroundColor: colors.get(item.calendar) ?? "var(--primary)" }}
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate">{item.title}</span>
              </li>
            ))}
          </ul>
        )}
      </Card.CardContent>
    </Card.Card>
  )
}

export function HomePage() {
  const { t, i18n } = ReactI18next.useTranslation("Home")
  const today = useNow(60_000).slice(0, 10)
  const tasks = ReactQuery.useQuery(Queries.workTasksOptions())
  const result = Summary.summary(tasks.data ?? [], today)
  const [shown, setShown] = React.useState<Api.TaskSummaryEncoded | null>(null)
  const date = new Intl.DateTimeFormat(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC"
  }).format(new Date(`${today}T12:00:00Z`))
  const deadlines = result.deadlines

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4">
      <PageHeader.PageHeader
        title={
          <>
            {t("title")} <span className="font-normal text-muted-foreground first-letter:uppercase">· {date}</span>
          </>
        }
      />
      <Running />
      {tasks.isPending ? (
        <Skeleton.Skeleton className="h-24 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Count label={t("counts.open")} value={result.open} to="/tasks" />
            <Count label={t("counts.overdue")} value={result.overdue} to="/tasks" alarm />
            <Count label={t("counts.inReview")} value={result.inReview} to="/board" />
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <div className="grid gap-4">
              <Agenda today={today} />
              <Card.Card size="sm">
                <Card.CardHeader>
                  <Card.CardTitle>{t("waiting.title")}</Card.CardTitle>
                </Card.CardHeader>
                <Card.CardContent>
                  {result.waiting.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("waiting.none")}</p>
                  ) : (
                    <TaskRows tasks={result.waiting} onOpen={setShown} />
                  )}
                </Card.CardContent>
              </Card.Card>
            </div>
            <Card.Card size="sm">
              <Card.CardHeader>
                <Card.CardTitle>{t("deadlines.title")}</Card.CardTitle>
              </Card.CardHeader>
              <Card.CardContent className="grid gap-4">
                {deadlines.today.length + deadlines.tomorrow.length + deadlines.thisWeek.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("deadlines.none")}</p>
                ) : (
                  <>
                    <Group title={t("deadlines.today")} tasks={deadlines.today} onOpen={setShown} />
                    <Group title={t("deadlines.tomorrow")} tasks={deadlines.tomorrow} onOpen={setShown} />
                    <Group title={t("deadlines.thisWeek")} tasks={deadlines.thisWeek} onOpen={setShown} />
                  </>
                )}
              </Card.CardContent>
            </Card.Card>
          </div>
        </>
      )}
      <TaskDialog.TaskDialog id={shown?.id ?? null} title={shown?.title ?? ""} onClose={() => setShown(null)} />
    </div>
  )
}
