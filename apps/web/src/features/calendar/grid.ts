import type * as Api from "@/lib/api/generated/types.gen"
import * as Prague from "@/lib/prague"

export const views = ["day", "week", "month"] as const
export type View = (typeof views)[number]

export type Item =
  | { readonly kind: "event"; readonly event: Api.EventEncoded }
  | { readonly kind: "block"; readonly block: Api.BlockEncoded }

export const dayMinutes = 24 * 60

/** A zero-length event still gets a quarter hour, or it would be a line nobody can click. */
const minimumMinutes = 15

const monthStart = (day: string) => `${day.slice(0, 7)}-01`

const shiftMonth = (day: string, by: number) => {
  const [year, month] = day.split("-").map(Number) as [number, number]
  const index = year * 12 + month - 1 + by
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`
}

const consecutive = (first: string, count: number) =>
  Array.from({ length: count }, (_unused, index) => Prague.addDays(first, index))

/** The days a view draws around `anchor`, Monday first; a month runs through whole weeks at both ends. */
export const daysOf = (view: View, anchor: string): ReadonlyArray<string> => {
  if (view === "day") return [anchor]
  if (view === "week") return consecutive(Prague.addDays(anchor, -Prague.weekday(anchor)), 7)
  const first = monthStart(anchor)
  const last = Prague.addDays(shiftMonth(anchor, 1), -1)
  const from = Prague.addDays(first, -Prague.weekday(first))
  const to = Prague.addDays(last, 6 - Prague.weekday(last))
  return consecutive(from, Prague.minutesBetween(`${from}T00:00`, `${to}T00:00`) / dayMinutes + 1)
}

export const step = (view: View, anchor: string, by: number) => {
  if (view === "day") return Prague.addDays(anchor, by)
  if (view === "week") return Prague.addDays(anchor, 7 * by)
  return shiftMonth(anchor, by)
}

/** The span a view asks the API for: the first day's midnight up to the midnight after the last day. */
export const windowOf = (days: ReadonlyArray<string>) => ({
  from: `${days[0]}T00:00`,
  to: `${Prague.addDays(days[days.length - 1] ?? "", 1)}T00:00`
})

export const minuteOf = (local: string) => Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16))

/** An all-day event by its dates, a timed one by the times it spans; its end is exclusive either way. */
export const occursOn = (event: Api.EventEncoded, day: string) =>
  event.allDay
    ? event.start.slice(0, 10) <= day && day < event.end.slice(0, 10)
    : event.end > `${day}T00:00` && event.start < `${Prague.addDays(day, 1)}T00:00`

/** A running block reaches to `now`. */
export const blockEnd = (block: Api.BlockEncoded, now: string) =>
  block.state === "running" || block.end === null ? (now > block.start ? now : block.start) : block.end

const blockOn = (block: Api.BlockEncoded, day: string, now: string) =>
  blockEnd(block, now) > `${day}T00:00` && block.start < `${Prague.addDays(day, 1)}T00:00`

export interface Placed {
  readonly key: string
  readonly item: Item
  readonly start: string
  readonly end: string
  readonly startsAt: number
  readonly endsAt: number
  /** Which of `lanes` side-by-side slots the item takes within its overlapping group. */
  readonly lane: number
  readonly lanes: number
}

export interface DayColumn {
  readonly day: string
  readonly allDay: ReadonlyArray<Api.EventEncoded>
  readonly timed: ReadonlyArray<Placed>
}

type Entry = Omit<Placed, "lane" | "lanes">

/** Items chained by overlaps share a group; each takes the first lane free at its start, and the group splits the width. */
const assignLanes = (entries: ReadonlyArray<Entry>): ReadonlyArray<Placed> => {
  const sorted = entries.toSorted((a, b) => a.startsAt - b.startsAt || b.endsAt - a.endsAt)
  const placed: Array<{ -readonly [K in keyof Placed]: Placed[K] }> = []
  let group: typeof placed = []
  let groupEnd = -1
  const close = () => {
    const lanes = Math.max(0, ...group.map((entry) => entry.lane + 1))
    for (const entry of group) entry.lanes = lanes
    group = []
  }
  for (const entry of sorted) {
    if (entry.startsAt >= groupEnd) close()
    const busy = new Set(group.filter((other) => other.endsAt > entry.startsAt).map((other) => other.lane))
    let lane = 0
    while (busy.has(lane)) lane += 1
    const slot = { ...entry, lane, lanes: 1 }
    group.push(slot)
    placed.push(slot)
    groupEnd = Math.max(groupEnd, entry.endsAt)
  }
  close()
  return placed
}

const entryOn = (day: string, key: string, item: Item, start: string, end: string): Entry => {
  const startsAt = start <= `${day}T00:00` ? 0 : minuteOf(start)
  const endsAt = end >= `${Prague.addDays(day, 1)}T00:00` ? dayMinutes : minuteOf(end)
  return { key, item, start, end, startsAt, endsAt: Math.min(dayMinutes, Math.max(endsAt, startsAt + minimumMinutes)) }
}

/** A block's own event stands for the block, so the grid draws the block and leaves that event out. */
export const shownEvents = (events: ReadonlyArray<Api.EventEncoded>) => events.filter((event) => event.block === null)

export const dayColumns = (
  events: ReadonlyArray<Api.EventEncoded>,
  blocks: ReadonlyArray<Api.BlockEncoded>,
  days: ReadonlyArray<string>,
  now: string
): ReadonlyArray<DayColumn> =>
  days.map((day) => {
    const onDay = events.filter((event) => occursOn(event, day))
    return {
      day,
      allDay: onDay.filter((event) => event.allDay),
      timed: assignLanes([
        ...onDay
          .filter((event) => !event.allDay)
          .map((event) => entryOn(day, event.id, { kind: "event", event }, event.start, event.end)),
        ...blocks
          .filter((block) => blockOn(block, day, now))
          .map((block) =>
            entryOn(day, `block-${block.id}`, { kind: "block", block }, block.start, blockEnd(block, now))
          )
      ])
    }
  })

export const isDraft = (item: Item) =>
  item.kind === "event" ? item.event.draft !== null : item.block.state === "draft"

export const hasDrafts = (column: DayColumn) =>
  column.allDay.some((event) => event.draft !== null) || column.timed.some(({ item }) => isDraft(item))

const startOf = (item: Item) => (item.kind === "event" ? item.event.start : item.block.start)
const allDayRank = (item: Item) => (item.kind === "event" && item.event.allDay ? 0 : 1)

/** The day's events and blocks in one list, as a month cell shows them: all-day events first, then by start. */
export const itemsOn = (
  events: ReadonlyArray<Api.EventEncoded>,
  blocks: ReadonlyArray<Api.BlockEncoded>,
  day: string,
  now: string
): ReadonlyArray<Item> =>
  [
    ...events.filter((event) => occursOn(event, day)).map((event): Item => ({ kind: "event", event })),
    ...blocks.filter((block) => blockOn(block, day, now)).map((block): Item => ({ kind: "block", block }))
  ].toSorted((a, b) => allDayRank(a) - allDayRank(b) || startOf(a).localeCompare(startOf(b)))
