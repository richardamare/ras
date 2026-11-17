import * as ReactI18next from "react-i18next"

import * as Grid from "@/features/calendar/grid"
import * as Items from "@/features/calendar/items"
import * as TimeGrid from "@/features/calendar/time-grid"
import type * as Api from "@/lib/api/generated/types.gen"
import * as Prague from "@/lib/prague"
import * as Utils from "@/lib/utils"

/** How many items a day cell lists before it counts the rest. */
const listed = 4

interface Props {
  readonly days: ReadonlyArray<string>
  readonly month: string
  readonly events: ReadonlyArray<Api.EventEncoded>
  readonly blocks: ReadonlyArray<Api.BlockEncoded>
  readonly now: string
  readonly colorOf: (calendar: number) => string
  readonly onOpenDay: (day: string) => void
  readonly onOpen: (item: Grid.Item) => void
}

export function MonthGrid({ days, month, events, blocks, now, colorOf, onOpenDay, onOpen }: Props) {
  const { t, i18n } = ReactI18next.useTranslation("Calendar")
  const weeks = Array.from({ length: days.length / 7 }, (_unused, week) => days.slice(week * 7, week * 7 + 7))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7 border-b-2">
        {days.slice(0, 7).map((day) => (
          <div
            key={day}
            className={Utils.cn("px-2 py-1.5 text-end text-sm", Prague.weekday(day) >= 5 && "text-muted-foreground")}
          >
            {TimeGrid.dayLabel(day, i18n.language, { weekday: "short" })}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} className="grid min-h-0 flex-1 grid-cols-7">
          {week.map((day, column) => {
            const items = Grid.itemsOn(events, blocks, day, now)
            const overflows = items.length > listed
            const shown = overflows ? items.slice(0, listed - 1) : items
            return (
              <div
                key={day}
                className={Utils.cn(
                  "flex min-h-0 min-w-0 flex-col gap-0.5 overflow-hidden border-b p-1",
                  column !== 0 && "border-s",
                  Prague.weekday(day) >= 5 && "bg-muted/50"
                )}
              >
                <button
                  type="button"
                  className={Utils.cn(
                    "ms-auto flex min-w-7 items-center justify-center rounded-full px-1.5 text-sm tabular-nums hover:bg-accent",
                    day.slice(0, 7) !== month.slice(0, 7) && "text-muted-foreground",
                    day === now.slice(0, 10) && "bg-destructive font-semibold text-white hover:bg-destructive"
                  )}
                  aria-label={TimeGrid.dayLabel(day, i18n.language, { weekday: "long", day: "numeric", month: "long" })}
                  onClick={() => onOpenDay(day)}
                >
                  {day.endsWith("-01")
                    ? TimeGrid.dayLabel(day, i18n.language, { day: "numeric", month: "short" })
                    : Number(day.slice(8))}
                </button>
                {shown.map((item) => (
                  <Items.Chip
                    key={item.kind === "block" ? `block-${item.block.id}` : item.event.id}
                    item={item}
                    color={colorOf(item.kind === "block" ? item.block.calendar : item.event.calendar)}
                    onOpen={() => onOpen(item)}
                  />
                ))}
                {overflows && (
                  <button
                    type="button"
                    className="px-1 text-start text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => onOpenDay(day)}
                  >
                    {t("more", { count: items.length - shown.length })}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
