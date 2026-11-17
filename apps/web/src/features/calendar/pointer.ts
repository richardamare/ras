import * as Grid from "@/features/calendar/grid"
import type * as Api from "@/lib/api/generated/types.gen"
import * as Prague from "@/lib/prague"

export const snap = 15
export const planMinutes = 60

/** The data type a task carries while it is dragged onto the grid. */
export const taskDragType = "application/x-ras-task"

/** A span inside one day, in minutes from its midnight; `end` may be the next midnight. */
export interface Placement {
  readonly day: string
  readonly start: number
  readonly end: number
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

export const snapped = (minutes: number) => Math.round(minutes / snap) * snap

/** The minute of the day under a pointer, given the grid body's top edge and height. */
export const minuteAt = (clientY: number, top: number, height: number) =>
  clamp(((clientY - top) / height) * Grid.dayMinutes, 0, Grid.dayMinutes)

export interface ColumnEdges {
  readonly day: string
  readonly left: number
  readonly right: number
}

/** The day whose column holds the pointer; past either end of the grid, the nearest column. */
export const columnAt = (clientX: number, columns: ReadonlyArray<ColumnEdges>) => {
  const hit = columns.find((column) => clientX >= column.left && clientX < column.right)
  if (hit !== undefined) return hit.day
  const first = columns.at(0)
  const last = columns.at(-1)
  if (first === undefined || last === undefined) return null
  return clientX < first.left ? first.day : last.day
}

export const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`

/** The Prague local time of a minute of a day; the day's last minute is the next midnight. */
export const localAt = (day: string, minute: number) =>
  minute >= Grid.dayMinutes ? `${Prague.addDays(day, 1)}T00:00` : `${day}T${clock(minute)}`

export const span = (placement: Placement) => ({
  start: localAt(placement.day, placement.start),
  end: localAt(placement.day, placement.end)
})

export const same = (a: Placement, b: Placement) => a.day === b.day && a.start === b.start && a.end === b.end

/** Moves an item so the point `grab` minutes below its top sits under the pointer, snapped and kept in the day. */
export const moved = (day: string, duration: number, grab: number, pointer: number): Placement => {
  const latest = Math.floor((Grid.dayMinutes - duration) / snap) * snap
  const start = clamp(snapped(pointer - grab), 0, latest)
  return { day, start, end: start + duration }
}

/** Resizes from the bottom edge: the pointer's quarter hour becomes the end, and at least a quarter hour stays. */
export const resized = (day: string, start: number, pointer: number): Placement => ({
  day,
  start,
  end: clamp(snapped(pointer), start + snap, Grid.dayMinutes)
})

/** A drag across empty time takes the range between its two quarter hours, at least a quarter hour long. */
export const spanned = (day: string, anchor: number, pointer: number): Placement => {
  const start = clamp(Math.min(anchor, pointer), 0, Grid.dayMinutes - snap)
  return { day, start, end: clamp(Math.max(anchor, pointer), start + snap, Grid.dayMinutes) }
}

/** A click on empty time, or a task dropped on the grid, takes the default length from that quarter hour. */
export const standard = (day: string, start: number, minutes = planMinutes): Placement => {
  const from = clamp(start, 0, Grid.dayMinutes - minutes)
  return { day, start: from, end: from + minutes }
}

/** The calendar rules as the console applies them: only a plain event of a writable calendar takes changes. */
export const editable = (event: Api.EventEncoded, calendars: ReadonlyArray<Api.CalendarEncoded>) =>
  !event.cancelled &&
  event.kind === "plain" &&
  event.block === null &&
  calendars.some((calendar) => calendar.id === event.calendar && calendar.writable && calendar.enabled)

/** An all-day event and an occurrence of a series change in the dialog, so a drop never moves a whole series. */
export const draggable = (item: Grid.Item, calendars: ReadonlyArray<Api.CalendarEncoded>) =>
  item.kind === "block"
    ? item.block.state === "planned" || item.block.state === "draft"
    : !item.event.allDay && !item.event.recurring && editable(item.event, calendars)
