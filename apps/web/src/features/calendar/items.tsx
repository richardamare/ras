import type * as React from "react"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"

import type * as Grid from "@/features/calendar/grid"
import type * as Track from "@/features/calendar/track-pointer"
import type * as Api from "@/lib/api/generated/types.gen"
import * as Utils from "@/lib/utils"

type Grab = (mode: "move" | "resize", origin: Track.Point) => void

const grabWith = (onGrab: Grab | undefined, mode: "move" | "resize") => (pointer: React.PointerEvent<HTMLElement>) => {
  if (onGrab === undefined || pointer.button !== 0) return
  if (mode === "resize") pointer.stopPropagation()
  onGrab(mode, { x: pointer.clientX, y: pointer.clientY })
}

function ResizeHandle({ onGrab }: { onGrab: Grab | undefined }) {
  if (onGrab === undefined) return null
  return (
    <span
      className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
      onPointerDown={grabWith(onGrab, "resize")}
      aria-hidden="true"
    />
  )
}

interface PlacedProps<A> {
  readonly placed: Grid.Placed
  readonly value: A
  readonly color: string
  /** Where the item sits in its column, as custom properties. */
  readonly style: React.CSSProperties
  /** Set only for an item the pointer can move or resize: the bottom edge resizes, the rest moves. */
  readonly onGrab: Grab | undefined
  readonly dimmed: boolean
  readonly onOpen: () => void
}

export function EventBlock({
  placed,
  value: event,
  color,
  style,
  onGrab,
  dimmed,
  onOpen
}: PlacedProps<Api.EventEncoded>) {
  const { t } = ReactI18next.useTranslation("Calendar")
  const minutes = placed.endsAt - placed.startsAt
  const title = event.title || t("untitled")
  const clock = event.start.slice(11)
  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerDown={grabWith(onGrab, "move")}
      data-show-as={event.showAs}
      data-draft={event.draft !== null}
      className={Utils.cn(
        "calendar-event absolute top-(--event-top) left-(--event-left) z-10 flex h-(--event-height) w-(--event-width) min-w-0 flex-col overflow-hidden rounded-md border-l-4 px-1.5 text-start text-xs leading-snug select-none hover:z-30 focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        minutes <= 30 ? "justify-center py-0" : "py-1",
        event.cancelled && "opacity-50",
        onGrab !== undefined && "cursor-grab",
        dimmed && "opacity-40"
      )}
      style={{ ...style, "--event-bar": color } as React.CSSProperties}
    >
      <span className={Utils.cn("truncate font-semibold", event.cancelled && "line-through")}>
        {minutes <= 30 ? `${title} ${clock}` : title}
      </span>
      {minutes > 45 && event.location !== null && (
        <span className="flex min-w-0 items-center gap-1 opacity-80">
          <LucideReact.MapPinIcon className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{event.location}</span>
        </span>
      )}
      {minutes > 30 && <span className="truncate tabular-nums opacity-80">{`${clock}–${event.end.slice(11)}`}</span>}
      <ResizeHandle onGrab={onGrab} />
    </button>
  )
}

export function BlockBlock({
  placed,
  value: block,
  color,
  style,
  onGrab,
  dimmed,
  onOpen
}: PlacedProps<Api.BlockEncoded>) {
  const { t } = ReactI18next.useTranslation("Calendar")
  const draft = block.state === "draft"
  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerDown={grabWith(onGrab, "move")}
      aria-label={`${draft ? `${t("draft.badge")} ` : ""}${t("block")}: ${block.title}`}
      data-draft={draft}
      className={Utils.cn(
        "absolute top-(--event-top) left-(--event-left) z-10 flex h-(--event-height) w-(--event-width) min-w-0 overflow-hidden rounded-md border-2 border-(--block-color) bg-(--block-color)/10 px-1.5 text-start text-xs leading-snug text-foreground select-none hover:z-30 focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        draft && "border-dashed bg-muted text-muted-foreground",
        placed.endsAt - placed.startsAt <= 30 ? "items-center gap-1 py-0" : "flex-col py-1",
        onGrab !== undefined && "cursor-grab",
        block.state === "running" && "motion-safe:animate-pulse",
        dimmed && "opacity-40"
      )}
      style={{ ...style, "--block-color": color } as React.CSSProperties}
    >
      <span className="flex min-w-0 items-center gap-1 font-semibold">
        <LucideReact.TimerIcon className="size-3 shrink-0 text-(--block-color)" aria-hidden="true" />
        <span className="truncate">{block.title}</span>
      </span>
      <ResizeHandle onGrab={onGrab} />
    </button>
  )
}

/** An item in an all-day row or a month cell. */
export function Chip({ item, color, onOpen }: { item: Grid.Item; color: string; onOpen: () => void }) {
  const { t } = ReactI18next.useTranslation("Calendar")
  if (item.kind === "block") {
    const draft = item.block.state === "draft"
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${draft ? `${t("draft.badge")} ` : ""}${t("block")}: ${item.block.title}`}
        className={Utils.cn(
          "flex min-w-0 items-center gap-1 rounded-sm border border-(--block-color) bg-(--block-color)/10 px-1 py-0.5 text-start text-xs",
          draft && "border-dashed bg-muted text-muted-foreground"
        )}
        style={{ "--block-color": color } as React.CSSProperties}
      >
        <LucideReact.TimerIcon className="size-3 shrink-0 text-(--block-color)" aria-hidden="true" />
        <span className="truncate font-semibold">{item.block.title}</span>
        <span className="ms-auto shrink-0 text-muted-foreground tabular-nums">{item.block.start.slice(11)}</span>
      </button>
    )
  }
  const { event } = item
  return (
    <button
      type="button"
      onClick={onOpen}
      data-show-as={event.showAs}
      data-draft={event.draft !== null}
      className={Utils.cn(
        "calendar-event flex min-w-0 items-center gap-1 rounded-sm border-l-4 px-1.5 py-0.5 text-start text-xs font-semibold",
        event.cancelled && "line-through opacity-60"
      )}
      style={{ "--event-bar": color } as React.CSSProperties}
    >
      <span className="truncate">{event.title || t("untitled")}</span>
      {!event.allDay && (
        <span className="ms-auto shrink-0 font-normal tabular-nums opacity-80">{event.start.slice(11)}</span>
      )}
    </button>
  )
}
