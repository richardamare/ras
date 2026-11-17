import * as ReactQuery from "@tanstack/react-query"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"

import type * as Work from "@/features/tasks/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import type * as Api from "@/lib/api/generated/types.gen"
import * as Prague from "@/lib/prague"
import * as Utils from "@/lib/utils"

const statusTones: Record<Work.Status, string> = {
  inbox: "bg-muted text-muted-foreground",
  todo: "bg-secondary text-secondary-foreground ring-1 ring-border ring-inset",
  in_progress: "bg-accent text-accent-foreground",
  blocked: "bg-warning-soft text-warning",
  review: "bg-primary-soft text-primary",
  done: "bg-success-soft text-success"
}

export function StatusBadge({ status }: { status: Work.Status }) {
  const { t } = ReactI18next.useTranslation("Work")
  return (
    <span
      className={Utils.cn(
        "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap",
        statusTones[status]
      )}
    >
      {t(`status.${status}`)}
    </span>
  )
}

/** Only urgent and high stand out; normal and low stay quiet. */
export function PriorityFlag({
  priority,
  withLabel = false
}: {
  priority: Api.TaskSummaryEncoded["priority"]
  withLabel?: boolean
}) {
  const { t } = ReactI18next.useTranslation("Work")
  if (priority !== "urgent" && priority !== "high") return null
  return (
    <span
      className={Utils.cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        priority === "urgent" ? "text-destructive" : "text-warning"
      )}
      title={t(`priority.${priority}`)}
    >
      <LucideReact.FlagIcon className="size-3" aria-hidden="true" />
      {withLabel ? t(`priority.${priority}`) : <span className="sr-only">{t(`priority.${priority}`)}</span>}
    </span>
  )
}

/** A day as people say it: today, tomorrow, yesterday, else the weekday and date; the year only when it differs. */
export const useDayLabel = () => {
  const { t, i18n } = ReactI18next.useTranslation("Work")
  const today = Prague.today()
  return (day: string) => {
    if (day === today) return t("day.today")
    if (day === Prague.addDays(today, 1)) return t("day.tomorrow")
    if (day === Prague.addDays(today, -1)) return t("day.yesterday")
    return new Intl.DateTimeFormat(i18n.language, {
      weekday: "short",
      day: "numeric",
      month: "numeric",
      ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
      timeZone: "UTC"
    }).format(new Date(`${day}T12:00:00Z`))
  }
}

/** A deadline, red once it has passed on a task that is not done. */
export function Due({
  task,
  className
}: {
  task: Pick<Api.TaskSummaryEncoded, "deadline" | "status">
  className?: string
}) {
  const label = useDayLabel()
  if (task.deadline === null) return <span className={Utils.cn("text-muted-foreground", className)}>—</span>
  const overdue = task.status !== "done" && task.deadline < Prague.today()
  return (
    <span
      className={Utils.cn(
        "inline-flex items-center gap-1 tabular-nums",
        overdue && "font-medium text-destructive",
        className
      )}
    >
      <LucideReact.CalendarClockIcon className="size-3 shrink-0" aria-hidden="true" />
      {label(task.deadline)}
    </span>
  )
}

/** The name an assignee goes by: "you" for the owner, an agent's display name for an agent. */
export const useAssignee = () => {
  const { t } = ReactI18next.useTranslation("Work")
  const agents = ReactQuery.useQuery(Queries.globalAgentsOptions())
  const names = new Map((agents.data ?? []).map((agent) => [agent.slug, agent.name]))
  return (assignee: string) => (assignee === "owner" ? t("owner") : (names.get(assignee) ?? assignee))
}

export function Assignee({ assignee }: { assignee: string }) {
  const name = useAssignee()(assignee)
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={Utils.cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full [&_svg]:size-3",
          assignee === "owner"
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-secondary-foreground ring-1 ring-border"
        )}
        aria-hidden="true"
      >
        {assignee === "owner" ? <LucideReact.UserIcon /> : <LucideReact.BotIcon />}
      </span>
      {name}
    </span>
  )
}
