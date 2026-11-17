import * as React from "react"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"

import * as IconButton from "@/components/icon-button"
import * as Grid from "@/features/calendar/grid"
import * as Items from "@/features/calendar/items"
import * as Pointer from "@/features/calendar/pointer"
import type * as Track from "@/features/calendar/track-pointer"
import * as Gestures from "@/features/calendar/use-grid-gestures"
import type * as Api from "@/lib/api/generated/types.gen"
import * as Prague from "@/lib/prague"
import * as Utils from "@/lib/utils"

/** One hour is 3.5rem tall (`h-14`), so a half-hour meeting still holds its title and time. */
const hourRem = 3.5
const hours = Array.from({ length: 24 }, (_unused, hour) => hour)
const morningHour = 7
const leadHours = 1.5

const offset = (minutes: number) => `${(minutes / 60) * hourRem}rem`

const weekend = (day: string) => Prague.weekday(day) >= 5

export const dayLabel = (day: string, language: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(language, { ...options, timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))

function Ghost({ placement }: { placement: Pointer.Placement }) {
  const style = {
    "--ghost-top": offset(placement.start),
    "--ghost-height": `calc(${offset(placement.end - placement.start)} - 2px)`
  } as React.CSSProperties
  return (
    <div
      className="pointer-events-none absolute top-(--ghost-top) left-px z-20 flex h-(--ghost-height) w-[calc(100%-3px)] items-center justify-center rounded-md border-2 border-dashed border-primary bg-primary/10 text-xs font-semibold tabular-nums"
      style={style}
      aria-hidden="true"
    >
      {`${Pointer.clock(placement.start)} – ${Pointer.clock(placement.end)}`}
    </div>
  )
}

interface Props {
  readonly days: ReadonlyArray<string>
  readonly events: ReadonlyArray<Api.EventEncoded>
  readonly blocks: ReadonlyArray<Api.BlockEncoded>
  readonly now: string
  readonly colorOf: (calendar: number) => string
  readonly canMove: (item: Grid.Item) => boolean
  readonly onOpen: (item: Grid.Item) => void
  readonly onCreate: (placement: Pointer.Placement) => void
  readonly onMove: (item: Grid.Item, placement: Pointer.Placement) => void
  readonly onPlanTask: (task: string, placement: Pointer.Placement) => void
  readonly onConfirmDay: (day: string) => void
}

export function TimeGrid({
  days,
  events,
  blocks,
  now,
  colorOf,
  canMove,
  onOpen,
  onCreate,
  onMove,
  onPlanTask,
  onConfirmDay
}: Props) {
  const { t, i18n } = ReactI18next.useTranslation("Calendar")
  const scroller = React.useRef<HTMLDivElement>(null)
  const body = React.useRef<HTMLDivElement>(null)
  const gestures = Gestures.useGridGestures({ body, onOpen, onCreate, onMove, onPlanTask })

  const columns = Grid.dayColumns(events, blocks, days, now)
  const today = now.slice(0, 10)
  const showsToday = days.includes(today)
  const nowMinutes = Grid.minuteOf(now)

  React.useEffect(() => {
    const element = scroller.current
    if (element === null) return
    const remPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
    const focus = showsToday ? Grid.minuteOf(Prague.local()) / 60 - leadHours : morningHour
    element.scrollTop = Math.max(0, focus) * hourRem * remPx
  }, [showsToday])

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto" onDragLeave={gestures.leaveTasks}>
      <div className="sticky top-0 z-40 bg-background">
        <div className="flex">
          <div className="w-16 shrink-0" />
          {columns.map((column) => (
            <div
              key={column.day}
              className={Utils.cn(
                "flex min-w-0 flex-1 items-center justify-center gap-1.5 py-2 text-lg",
                weekend(column.day) && "text-muted-foreground"
              )}
            >
              <span>{dayLabel(column.day, i18n.language, { weekday: "short" })}</span>
              <span
                className={Utils.cn(
                  "flex min-w-8 items-center justify-center rounded-full px-1.5 tabular-nums",
                  column.day === today && "bg-destructive font-semibold text-white"
                )}
              >
                {Number(column.day.slice(8))}
              </span>
              {Grid.hasDrafts(column) && (
                <IconButton.IconButton
                  label={t("draft.confirmDay", {
                    day: dayLabel(column.day, i18n.language, { weekday: "long", day: "numeric", month: "long" })
                  })}
                  onClick={() => onConfirmDay(column.day)}
                >
                  <LucideReact.CheckCheckIcon />
                </IconButton.IconButton>
              )}
            </div>
          ))}
        </div>
        <div className="flex border-b-2">
          <div className="w-16 shrink-0 py-1 pe-2 text-end text-xs text-muted-foreground">{t("allDay")}</div>
          {columns.map((column) => (
            <div
              key={column.day}
              className={Utils.cn(
                "flex min-h-6 min-w-0 flex-1 flex-col gap-0.5 border-s p-0.5",
                weekend(column.day) && "bg-muted/50"
              )}
            >
              {column.allDay.map((event) => (
                <Items.Chip
                  key={event.id}
                  item={{ kind: "event", event }}
                  color={colorOf(event.calendar)}
                  onOpen={() => gestures.open({ kind: "event", event })}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div ref={body} className="relative flex">
        <div className="relative w-16 shrink-0">
          {hours.map((hour) => (
            <div key={hour} className="relative h-14">
              {hour !== 0 && !(showsToday && Math.abs(nowMinutes - hour * 60) < 15) && (
                <span className="absolute end-2 -top-2 text-xs text-muted-foreground tabular-nums">
                  {Pointer.clock(hour * 60)}
                </span>
              )}
            </div>
          ))}
          {showsToday && (
            <span
              className="absolute end-1 top-(--now) z-30 -translate-y-1/2 rounded-full bg-destructive px-1.5 py-0.5 text-xs font-semibold text-white tabular-nums"
              style={{ "--now": offset(nowMinutes) } as React.CSSProperties}
            >
              {now.slice(11)}
            </span>
          )}
        </div>
        {columns.map((column) => (
          <div
            key={column.day}
            data-day-column={column.day}
            className={Utils.cn("relative min-w-0 flex-1 border-s", weekend(column.day) && "bg-muted/50")}
            onPointerDown={(event) => gestures.startCreate(event, column.day)}
            onDragOver={(event) => gestures.hoverTask(event, column.day)}
            onDrop={(event) => gestures.dropTask(event, column.day)}
          >
            {hours.map((hour) => (
              <div key={hour} className="h-14 border-b border-border/70" aria-hidden="true" />
            ))}
            {column.timed.map((placed) => {
              const style = {
                "--event-top": offset(placed.startsAt),
                "--event-height": `calc(${offset(placed.endsAt - placed.startsAt)} - 2px)`,
                "--event-left": `calc(${(placed.lane / placed.lanes) * 100}% + 1px)`,
                "--event-width": `calc(${100 / placed.lanes}% - 3px)`
              } as React.CSSProperties
              const onGrab = canMove(placed.item)
                ? (mode: "move" | "resize", origin: Track.Point) => gestures.grab(placed, column.day, mode, origin)
                : undefined
              const shared = {
                placed,
                style,
                onGrab,
                dimmed: gestures.preview?.moving === placed.key,
                onOpen: () => gestures.open(placed.item)
              }
              return placed.item.kind === "block" ? (
                <Items.BlockBlock
                  key={placed.key}
                  {...shared}
                  value={placed.item.block}
                  color={colorOf(placed.item.block.calendar)}
                />
              ) : (
                <Items.EventBlock
                  key={placed.key}
                  {...shared}
                  value={placed.item.event}
                  color={colorOf(placed.item.event.calendar)}
                />
              )
            })}
            {gestures.preview !== null && gestures.preview.placement.day === column.day && (
              <Ghost placement={gestures.preview.placement} />
            )}
            <div
              className={Utils.cn(
                "pointer-events-none absolute inset-x-0 top-(--now) z-20 flex h-0 items-center",
                column.day !== today && "opacity-30"
              )}
              style={{ "--now": offset(nowMinutes) } as React.CSSProperties}
              aria-hidden="true"
            >
              {column.day === today && <span className="-ms-1 size-2 shrink-0 rounded-full bg-destructive" />}
              <span className={Utils.cn("flex-1 bg-destructive", column.day === today ? "h-0.5" : "h-px")} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
