import * as React from "react"

import type * as Grid from "@/features/calendar/lib/grid"
import * as Pointer from "@/features/calendar/lib/pointer"
import * as Track from "@/features/calendar/lib/track-pointer"

/** `moving` names the item being dragged, so it is drawn dimmed under its ghost. */
export interface Preview {
  readonly placement: Pointer.Placement
  readonly moving: string | null
}

interface Geometry {
  readonly top: number
  readonly height: number
  readonly columns: ReadonlyArray<Pointer.ColumnEdges>
}

interface Options {
  readonly body: React.RefObject<HTMLDivElement | null>
  readonly onOpen: (item: Grid.Item) => void
  readonly onCreate: (placement: Pointer.Placement) => void
  readonly onMove: (item: Grid.Item, placement: Pointer.Placement) => void
  readonly onPlanTask: (task: string, placement: Pointer.Placement) => void
}

/** What the pointer and a dragged task do on the time grid; each gesture previews its span and reports it once, at its end. */
export const useGridGestures = ({ body, onOpen, onCreate, onMove, onPlanTask }: Options) => {
  const suppressClick = React.useRef(false)
  const [preview, setPreview] = React.useState<Preview | null>(null)

  const geometry = (): Geometry | null => {
    const element = body.current
    if (element === null) return null
    const rect = element.getBoundingClientRect()
    const columns = Array.from(element.querySelectorAll<HTMLElement>("[data-day-column]")).map((column) => {
      const edges = column.getBoundingClientRect()
      return { day: column.dataset["dayColumn"] ?? "", left: edges.left, right: edges.right }
    })
    return { top: rect.top, height: rect.height, columns }
  }

  const minuteUnder = (clientY: number) => {
    const geo = geometry()
    return geo === null ? null : Pointer.snapped(Pointer.minuteAt(clientY, geo.top, geo.height))
  }

  /** A press that became a drag must not also count as a click on what it started on. */
  const markDragged = () => {
    suppressClick.current = true
    window.setTimeout(() => {
      suppressClick.current = false
    }, 0)
  }

  const open = (item: Grid.Item) => {
    if (!suppressClick.current) onOpen(item)
  }

  const startCreate = (event: React.PointerEvent<HTMLDivElement>, day: string) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, a") !== null) return
    const anchor = minuteUnder(event.clientY)
    if (anchor === null) return
    let spanned: Pointer.Placement | null = null
    Track.trackPointer(
      { x: event.clientX, y: event.clientY },
      {
        onDrag: (at) => {
          const pointer = minuteUnder(at.y)
          if (pointer === null) return
          spanned = Pointer.spanned(day, anchor, pointer)
          setPreview({ placement: spanned, moving: null })
        },
        onEnd: (_at, outcome) => {
          setPreview(null)
          if (outcome === "cancel") return
          if (outcome === "click") return onCreate(Pointer.standard(day, anchor))
          markDragged()
          if (spanned !== null) onCreate(spanned)
        }
      }
    )
  }

  const grab = (placed: Grid.Placed, day: string, mode: "move" | "resize", origin: Track.Point) => {
    const geo = geometry()
    if (geo === null) return
    const original: Pointer.Placement = { day, start: placed.startsAt, end: placed.endsAt }
    const grabbed = Pointer.minuteAt(origin.y, geo.top, geo.height) - placed.startsAt
    const duration = placed.endsAt - placed.startsAt
    let target = original
    Track.trackPointer(origin, {
      onDrag: (at) => {
        const current = geometry()
        if (current === null) return
        const pointer = Pointer.minuteAt(at.y, current.top, current.height)
        target =
          mode === "move"
            ? Pointer.moved(Pointer.columnAt(at.x, current.columns) ?? day, duration, grabbed, pointer)
            : Pointer.resized(day, placed.startsAt, pointer)
        setPreview({ placement: target, moving: placed.key })
      },
      onEnd: (_at, outcome) => {
        setPreview(null)
        if (outcome !== "drag") return
        markDragged()
        if (!Pointer.same(target, original)) onMove(placed.item, target)
      }
    })
  }

  const hoverTask = (event: React.DragEvent<HTMLDivElement>, day: string) => {
    if (!event.dataTransfer.types.includes(Pointer.taskDragType)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
    const start = minuteUnder(event.clientY)
    if (start === null) return
    const placement = Pointer.standard(day, start)
    setPreview((current) =>
      current?.moving === null && Pointer.same(current.placement, placement) ? current : { placement, moving: null }
    )
  }

  const dropTask = (event: React.DragEvent<HTMLDivElement>, day: string) => {
    setPreview(null)
    const task = event.dataTransfer.getData(Pointer.taskDragType)
    const start = minuteUnder(event.clientY)
    if (task === "" || start === null) return
    event.preventDefault()
    onPlanTask(task, Pointer.standard(day, start))
  }

  const leaveTasks = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPreview(null)
  }

  return { preview, open, startCreate, grab, hoverTask, dropTask, leaveTasks }
}
