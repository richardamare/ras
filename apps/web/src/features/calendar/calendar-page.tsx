import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"
import * as Nuqs from "nuqs"
import * as Sonner from "sonner"

import * as IconButton from "@/components/icon-button"
import * as Button from "@/components/ui/button"
import * as Skeleton from "@/components/ui/skeleton"
import * as DraftControls from "@/features/calendar/draft-controls"
import * as EventDialog from "@/features/calendar/event-dialog"
import * as Grid from "@/features/calendar/grid"
import * as ItemPopover from "@/features/calendar/item-popover"
import * as MonthGrid from "@/features/calendar/month-grid"
import * as Pointer from "@/features/calendar/pointer"
import * as TasksPanel from "@/features/calendar/tasks-panel"
import * as TimeGrid from "@/features/calendar/time-grid"
import * as Url from "@/features/calendar/url"
import * as Work from "@/features/tasks/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import * as Prague from "@/lib/prague"
import * as Utils from "@/lib/utils"
import * as TaskUrl from "@/features/tasks/url"

const useNow = () => {
  const [now, setNow] = React.useState(() => Prague.local())
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Prague.local()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

const newEventMinute = 9 * 60

export function CalendarPage() {
  const { t, i18n } = ReactI18next.useTranslation("Calendar")
  const [{ view, date, item: itemId }, setUrl] = Nuqs.useQueryStates(Url.params)
  const openTask = TaskUrl.useOpenTask()
  const client = ReactQuery.useQueryClient()
  const now = useNow()
  const today = now.slice(0, 10)
  const anchor = date ?? today
  const days = Grid.daysOf(view, anchor)
  const showsToday = days.includes(today)
  const span = Grid.windowOf(days)

  const events = ReactQuery.useQuery(Queries.calendarEventsOptions({ query: span }))
  const blocks = ReactQuery.useQuery(Queries.workBlocksOptions({ query: span }))
  const calendars = ReactQuery.useQuery(Queries.calendarCalendarsOptions())
  const allCalendars = calendars.data ?? []
  const enabled = new Set(allCalendars.filter((calendar) => calendar.enabled).map((calendar) => calendar.id))
  const colors = new Map(allCalendars.map((calendar) => [calendar.id, calendar.color]))
  const colorOf = (calendar: number) => colors.get(calendar) ?? "var(--primary)"

  const shownEvents = Grid.shownEvents(events.data ?? []).filter((event) => enabled.has(event.calendar))
  const shownBlocks = (blocks.data ?? []).filter((block) => enabled.has(block.calendar))
  const draftsInView =
    shownEvents.filter((event) => event.draft !== null).length +
    shownBlocks.filter((block) => block.state === "draft").length

  const [drafting, setDrafting] = React.useState(false)
  const [planner, setPlanner] = React.useState(false)
  const eventDialog = EventDialog.useEventDialog()

  const settle = {
    onSuccess: () => client.invalidateQueries(),
    onError: (error: unknown) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  }
  const plan = ReactQuery.useMutation({ ...Queries.workPlanMutation(), ...settle })
  const moveBlock = ReactQuery.useMutation({ ...Queries.workMoveMutation(), ...settle })
  const moveEvent = ReactQuery.useMutation({ ...Queries.calendarChangeEventMutation(), ...settle })
  const confirmDay = DraftControls.useConfirmDrafts()

  const show = (nextView: Grid.View, nextDate: string) =>
    void setUrl({ view: nextView, date: nextDate, item: null }, { history: "push" })

  /** With drafting on only drafts move, so nothing already in a calendar changes before the plan is confirmed. */
  const canMove = (item: Grid.Item) => Pointer.draggable(item, allCalendars) && (!drafting || Grid.isDraft(item))

  const move = (item: Grid.Item, placement: Pointer.Placement) => {
    const body = Pointer.span(placement)
    if (item.kind === "block") moveBlock.mutate({ path: { id: item.block.id }, body })
    else moveEvent.mutate({ path: { id: item.event.id }, body })
  }

  const open = (item: Grid.Item) =>
    void setUrl({ item: item.kind === "event" ? item.event.id : item.block.id }, { history: "push" })
  const close = () => void setUrl({ item: null })

  const openedEvent = shownEvents.find((event) => event.id === itemId)
  const openedBlock = shownBlocks.find((block) => block.id === itemId)
  const openedItem: Grid.Item | null =
    openedEvent !== undefined
      ? { kind: "event", event: openedEvent }
      : openedBlock !== undefined
        ? { kind: "block", block: openedBlock }
        : null

  const grid = () => {
    if (events.isPending || blocks.isPending) return <Skeleton.Skeleton className="flex-1" />
    if (view === "month")
      return (
        <MonthGrid.MonthGrid
          days={days}
          month={anchor}
          events={shownEvents}
          blocks={shownBlocks}
          now={now}
          colorOf={colorOf}
          onOpenDay={(day) => show("day", day)}
          onOpen={open}
        />
      )
    return (
      <TimeGrid.TimeGrid
        key={`${view}-${anchor}`}
        days={days}
        events={shownEvents}
        blocks={shownBlocks}
        now={now}
        colorOf={colorOf}
        canMove={canMove}
        onOpen={open}
        onCreate={(placement) => eventDialog.open({ state: { kind: "create", placement, draft: drafting } })}
        onMove={move}
        onPlanTask={(id, placement) =>
          plan.mutate({
            body: {
              task: id,
              start: Pointer.span(placement).start,
              minutes: placement.end - placement.start,
              draft: drafting
            }
          })
        }
        onConfirmDay={(day) => {
          if (!confirmDay.isPending) confirmDay.mutate({ body: { day } })
        }}
      />
    )
  }

  const fetching = events.isFetching || blocks.isFetching
  const problem = events.error ?? blocks.error

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1">
          <IconButton.IconButton
            label={t(`previous.${view}`)}
            variant="outline"
            onClick={() => show(view, Grid.step(view, anchor, -1))}
          >
            <LucideReact.ChevronLeftIcon />
          </IconButton.IconButton>
          <Button.Button variant="outline" disabled={showsToday} onClick={() => show(view, today)}>
            {t("today")}
          </Button.Button>
          <IconButton.IconButton
            label={t(`next.${view}`)}
            variant="outline"
            onClick={() => show(view, Grid.step(view, anchor, 1))}
          >
            <LucideReact.ChevronRightIcon />
          </IconButton.IconButton>
        </div>
        <h1 className="me-auto text-2xl tracking-tight first-letter:uppercase">
          <span className="font-semibold">
            {TimeGrid.dayLabel(
              anchor,
              i18n.language,
              view === "day" ? { day: "numeric", month: "long" } : { month: "long" }
            )}
          </span>{" "}
          <span className="text-muted-foreground">{anchor.slice(0, 4)}</span>
        </h1>
        <div className="flex rounded-md border p-0.5" role="group" aria-label={t("view.label")}>
          {Grid.views.map((option) => (
            <Button.Button
              key={option}
              size="sm"
              variant={option === view ? "secondary" : "ghost"}
              aria-pressed={option === view}
              onClick={() => show(option, anchor)}
            >
              {t(`view.${option}`)}
            </Button.Button>
          ))}
        </div>
        <DraftControls.DraftControls drafting={drafting} inView={draftsInView} onDrafting={setDrafting} />
        {view !== "month" && (
          <Button.Button
            variant={planner ? "secondary" : "outline"}
            aria-pressed={planner}
            onClick={() => setPlanner(!planner)}
          >
            <LucideReact.ListTodoIcon />
            {t("planner.title")}
          </Button.Button>
        )}
        <Button.Button
          onClick={() =>
            eventDialog.open({
              state: {
                kind: "create",
                placement: Pointer.standard(showsToday ? today : anchor, newEventMinute),
                draft: drafting
              }
            })
          }
        >
          <LucideReact.PlusIcon />
          {t("newEvent")}
        </Button.Button>
      </div>

      {problem !== null && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {Work.reasonOf(problem) ?? t("unreachable")}
        </p>
      )}

      <div className="relative flex min-h-[32rem] flex-1">
        <div
          className={Utils.cn(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background transition-opacity",
            fetching && "opacity-60"
          )}
          aria-busy={fetching}
        >
          {grid()}
        </div>
        {planner && view !== "month" && <TasksPanel.TasksPanel onClose={() => setPlanner(false)} />}
      </div>

      <ItemPopover.ItemPopover
        item={openedItem}
        calendars={allCalendars}
        colorOf={colorOf}
        onClose={close}
        onEdit={(event) => {
          close()
          eventDialog.open({ state: { kind: "edit", event } })
        }}
        onOpenTask={(block) => {
          close()
          openTask(block.task)
        }}
      />
    </div>
  )
}
