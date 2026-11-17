import type * as React from "react"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"

import * as Button from "@/components/ui/button"
import * as Popover from "@/components/ui/popover"
import type * as Api from "@/lib/api/generated/types.gen"

/** Shows or hides each enabled calendar on the calendar screen. */
export function CalendarFilter({
  calendars,
  hidden,
  onToggle
}: {
  calendars: ReadonlyArray<Api.CalendarEncoded>
  hidden: ReadonlySet<number>
  onToggle: (calendar: number) => void
}) {
  const { t } = ReactI18next.useTranslation("Calendar")
  const shown = calendars.filter((calendar) => !hidden.has(calendar.id)).length
  return (
    <Popover.Popover>
      <Popover.PopoverTrigger asChild>
        <Button.Button variant={shown < calendars.length ? "secondary" : "outline"}>
          <LucideReact.ListFilterIcon />
          {t("filter.label")}
          {shown < calendars.length && (
            <span className="text-muted-foreground tabular-nums">
              {shown}/{calendars.length}
            </span>
          )}
        </Button.Button>
      </Popover.PopoverTrigger>
      <Popover.PopoverContent align="end" className="flex w-64 flex-col gap-1 p-2">
        <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">{t("filter.title")}</p>
        {calendars.map((calendar) => (
          <label
            key={calendar.id}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          >
            <input
              type="checkbox"
              checked={!hidden.has(calendar.id)}
              onChange={() => onToggle(calendar.id)}
              className="size-4 shrink-0 cursor-pointer accent-(--calendar-color)"
              style={{ "--calendar-color": calendar.color } as React.CSSProperties}
            />
            <span className="min-w-0 truncate">{calendar.name}</span>
          </label>
        ))}
        <p className="px-2 pt-1 text-xs text-muted-foreground">{t("filter.hint")}</p>
      </Popover.PopoverContent>
    </Popover.Popover>
  )
}
