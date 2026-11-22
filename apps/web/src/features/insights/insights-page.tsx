import type * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"
import * as Nuqs from "nuqs"

import * as IconButton from "@/components/icon-button"
import * as Alert from "@/components/ui/alert"
import * as Button from "@/components/ui/button"
import * as Skeleton from "@/components/ui/skeleton"
import * as TimeGrid from "@/features/calendar/time-grid"
import * as ChosenCalendars from "@/features/insights/chosen-calendars"
import * as Hours from "@/features/insights/hours"
import * as Period from "@/features/insights/period"
import * as Timesheet from "@/features/insights/timesheet"
import * as Url from "@/features/insights/url"
import * as Work from "@/features/tasks/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import type * as Api from "@/lib/api/generated/types.gen"
import * as Prague from "@/lib/prague"
import * as Utils from "@/lib/utils"

type Insights = Api.InsightsEncoded
type ShownEvent = Insights["unanswered"][number]

function Time({ minutes, className }: { minutes: number; className?: string }) {
  const { i18n } = ReactI18next.useTranslation("Insights")
  return (
    <span className={Utils.cn("inline-flex items-baseline gap-2 tabular-nums", className)}>
      <span>{Hours.clock(minutes)}</span>
      <span className="text-xs text-muted-foreground">{Hours.decimal(minutes, i18n.language)}</span>
    </span>
  )
}

function Section({ title, total, children }: { title: string; total?: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-card p-4" aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {total !== undefined && <Time minutes={total} className="text-sm font-semibold" />}
      </div>
      {children}
    </section>
  )
}

function Line({ label, minutes, inset }: { label: string; minutes: number; inset?: boolean }) {
  return (
    <li
      className={Utils.cn("flex items-baseline justify-between gap-3 text-sm", inset && "ps-4 text-muted-foreground")}
    >
      <span className="min-w-0 truncate">{label}</span>
      <Time minutes={minutes} />
    </li>
  )
}

const useLabels = () => {
  const { t, i18n } = ReactI18next.useTranslation("Insights")
  const day = (date: string, options: Intl.DateTimeFormatOptions) => TimeGrid.dayLabel(date, i18n.language, options)
  const range = (first: string, last: string) =>
    first === last
      ? day(first, { weekday: "short", day: "numeric", month: "numeric" })
      : `${day(first, { day: "numeric", month: "numeric" })} – ${day(last, { day: "numeric", month: "numeric" })}`
  return {
    period: (kind: Period.Kind, first: string, last: string) => {
      if (kind === "week")
        return `${day(first, { day: "numeric", month: "short" })} – ${day(last, { day: "numeric", month: "short", year: "numeric" })}`
      if (kind === "month") return day(first, { month: "long", year: "numeric" })
      return t("quarterLabel", { quarter: (Number(first.slice(5, 7)) + 2) / 3, year: first.slice(0, 4) })
    },
    part: (kind: Period.Kind, part: Insights["parts"][number]) =>
      kind === "quarter" ? day(part.first, { month: "long" }) : range(part.first, part.last),
    when: (event: ShownEvent) =>
      `${day(event.start.slice(0, 10), { weekday: "short", day: "numeric", month: "numeric" })} ${event.start.slice(11, 16)}–${event.end.slice(11, 16)}`
  }
}

function EventList({ events }: { events: ReadonlyArray<ShownEvent> }) {
  const { t } = ReactI18next.useTranslation("Insights")
  const labels = useLabels()
  return (
    <ul className="mt-1 flex flex-col gap-0.5">
      {events.map((event) => (
        <li key={event.event} className="flex flex-wrap items-baseline gap-x-3 text-sm">
          <span className="font-medium">{event.title || t("untitled")}</span>
          <span className="text-muted-foreground tabular-nums">{labels.when(event)}</span>
        </li>
      ))}
    </ul>
  )
}

function Report({
  insights,
  weekBefore,
  calendars,
  work
}: {
  insights: Insights
  weekBefore: Insights | undefined
  calendars: ReadonlyArray<Api.CalendarEncoded>
  work: Parameters<typeof Timesheet.timesheet>[1]
}) {
  const { t } = ReactI18next.useTranslation("Insights")
  const labels = useLabels()
  const kind = insights.period.kind
  const names = new Map(calendars.map((calendar) => [calendar.id, calendar.name]))
  const lines = Timesheet.timesheet(insights.workBlocks.blocks, work)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        <section className="flex flex-col rounded-xl border bg-card p-4" aria-label={t("taken")}>
          <span className="text-sm text-muted-foreground">{t("taken")}</span>
          <Time minutes={insights.taken} className="text-3xl font-semibold" />
        </section>
        <section className="flex flex-col rounded-xl border bg-card p-4" aria-label={t("planned")}>
          <span className="text-sm text-muted-foreground">{t("planned")}</span>
          <Time minutes={insights.planned} className="text-3xl text-muted-foreground" />
        </section>
        {weekBefore !== undefined && (
          <section className="flex flex-col rounded-xl border bg-card p-4" aria-label={t("weekBefore")}>
            <span className="text-sm text-muted-foreground">{t("weekBefore")}</span>
            <Time minutes={weekBefore.taken} className="text-3xl" />
          </section>
        )}
      </div>

      {insights.unanswered.length > 0 && (
        <Alert.Alert variant="warning">
          <LucideReact.TriangleAlertIcon />
          <Alert.AlertTitle>{t("unanswered.title")}</Alert.AlertTitle>
          <Alert.AlertDescription>
            {t("unanswered.hint")}
            <EventList events={insights.unanswered} />
          </Alert.AlertDescription>
        </Alert.Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t(`parts.${kind}`)}>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th />
                <th className="text-start font-medium">{weekBefore === undefined ? t("taken") : t("thisWeek")}</th>
                <th className="text-start font-medium">{t("planned")}</th>
                {weekBefore !== undefined && <th className="text-start font-medium">{t("weekBefore")}</th>}
              </tr>
            </thead>
            <tbody>
              {insights.parts.map((part, index) => (
                <tr key={part.first}>
                  <td className="py-0.5 pe-3 first-letter:uppercase">{labels.part(kind, part)}</td>
                  <td>
                    <Time minutes={part.taken} />
                  </td>
                  <td className="text-muted-foreground">
                    <Time minutes={part.planned} />
                  </td>
                  {weekBefore !== undefined && (
                    <td>
                      <Time minutes={weekBefore.parts[index]?.taken ?? 0} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title={t("perCalendar")}>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th />
                <th className="text-start font-medium">{t("taken")}</th>
                <th className="text-start font-medium">{t("planned")}</th>
              </tr>
            </thead>
            <tbody>
              {insights.calendars.map((calendar) => (
                <tr key={calendar.calendar}>
                  <td className="py-0.5 pe-3">{names.get(calendar.calendar) ?? calendar.calendar}</td>
                  <td>
                    <Time minutes={calendar.taken} />
                  </td>
                  <td className="text-muted-foreground">
                    <Time minutes={calendar.planned} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title={t("workBlocks")} total={insights.workBlocks.minutes}>
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("nothing")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {lines.flatMap((line) => [
                <Line key={`p-${line.project}`} label={line.project ?? t("noProject")} minutes={line.minutes} />,
                ...line.tasks.map((task) => (
                  <Line
                    key={`t-${line.project}-${task.task}`}
                    label={task.task ?? t("unknownTask")}
                    minutes={task.minutes}
                    inset
                  />
                ))
              ])}
            </ul>
          )}
        </Section>

        <Section title={t("otherEvents")} total={insights.otherEvents.minutes}>
          {insights.otherEvents.titles.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("nothing")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {insights.otherEvents.titles.map((title) => (
                <Line key={title.title} label={title.title || t("untitled")} minutes={title.minutes} />
              ))}
            </ul>
          )}
        </Section>

        {insights.unconfirmed.drafts.length > 0 && (
          <Section title={t("unconfirmed.title")} total={insights.unconfirmed.minutes}>
            <p className="text-sm text-muted-foreground">{t("unconfirmed.hint")}</p>
            <EventList events={insights.unconfirmed.drafts} />
          </Section>
        )}
      </div>
    </div>
  )
}

export function InsightsPage() {
  const { t } = ReactI18next.useTranslation("Insights")
  const labels = useLabels()
  const [{ period, date }, setUrl] = Nuqs.useQueryStates(Url.params)
  const today = Prague.today()
  const anchor = date ?? today
  const calendars = ReactQuery.useQuery(Queries.calendarCalendarsOptions())
  const shown = (calendars.data ?? []).filter((calendar) => calendar.enabled)
  const { chosen, toggle } = ChosenCalendars.useChosenCalendars(
    calendars.data === undefined ? undefined : shown.map((calendar) => calendar.id)
  )
  const ticked = chosen.length > 0

  const insightsOf = (day: string, enabled: boolean) => ({
    ...Queries.calendarInsightsOptions({ query: { kind: period, date: day, calendar: chosen.map(String) } }),
    enabled
  })
  const insights = ReactQuery.useQuery(insightsOf(anchor, ticked))
  const weekBefore = ReactQuery.useQuery(insightsOf(Period.step("week", anchor, -1), ticked && period === "week"))

  const span =
    insights.data === undefined
      ? undefined
      : { from: `${insights.data.first}T00:00`, to: `${Prague.addDays(insights.data.last, 1)}T00:00` }
  const blocks = ReactQuery.useQuery({
    ...Queries.workBlocksOptions({ query: span ?? { from: "", to: "" } }),
    enabled: span !== undefined
  })
  const tasks = ReactQuery.useQuery(Queries.workTasksOptions())
  const projects = ReactQuery.useQuery(Queries.workProjectsOptions())

  const show = (kind: Period.Kind, day: string) => void setUrl({ period: kind, date: day }, { history: "push" })
  const first = Period.first(period, anchor)
  const last = Prague.addDays(Period.step(period, first, 1), -1)

  const body = () => {
    if (!ticked)
      return (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {t("noneChosen")}
        </p>
      )
    if (insights.error !== null)
      return (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {Work.reasonOf(insights.error) ?? t("unreachable")}
        </p>
      )
    if (insights.data === undefined) return <Skeleton.Skeleton className="h-64 w-full" />
    return (
      <Report
        insights={insights.data}
        weekBefore={period === "week" ? weekBefore.data : undefined}
        calendars={shown}
        work={{ blocks: blocks.data ?? [], tasks: tasks.data ?? [], projects: projects.data ?? [] }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1">
          <IconButton.IconButton
            label={t(`previous.${period}`)}
            variant="outline"
            onClick={() => show(period, Period.step(period, anchor, -1))}
          >
            <LucideReact.ChevronLeftIcon />
          </IconButton.IconButton>
          <Button.Button
            variant="outline"
            disabled={Period.contains(period, anchor, today)}
            onClick={() => show(period, today)}
          >
            {t("today")}
          </Button.Button>
          <IconButton.IconButton
            label={t(`next.${period}`)}
            variant="outline"
            onClick={() => show(period, Period.step(period, anchor, 1))}
          >
            <LucideReact.ChevronRightIcon />
          </IconButton.IconButton>
        </div>
        <h1 className="me-auto text-2xl font-semibold tracking-tight first-letter:uppercase">
          {labels.period(period, first, last)}
        </h1>
        <div className="flex rounded-md border p-0.5" role="group" aria-label={t("period.label")}>
          {Period.kinds.map((option) => (
            <Button.Button
              key={option}
              size="sm"
              variant={option === period ? "secondary" : "ghost"}
              aria-pressed={option === period}
              onClick={() => show(option, anchor)}
            >
              {t(`period.${option}`)}
            </Button.Button>
          ))}
        </div>
      </div>

      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-card px-4 py-2">
        <legend className="px-1 text-xs font-semibold text-muted-foreground">{t("calendars")}</legend>
        {calendars.isPending && <Skeleton.Skeleton className="h-5 w-48" />}
        {shown.map((calendar) => (
          <label key={calendar.id} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={chosen.includes(calendar.id)}
              onChange={() => toggle(calendar.id)}
              className="size-4 shrink-0 cursor-pointer accent-(--calendar-color)"
              style={{ "--calendar-color": calendar.color } as React.CSSProperties}
            />
            <span>{calendar.name}</span>
            {!calendar.writable && <LucideReact.LockIcon className="size-3 text-muted-foreground" />}
          </label>
        ))}
      </fieldset>

      {body()}
    </div>
  )
}
