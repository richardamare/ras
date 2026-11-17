import * as Nuqs from "nuqs"

import * as Grid from "@/features/calendar/grid"

const day = Nuqs.createParser({
  parse: (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null),
  serialize: (value: string) => value
})

/** The view, the day it shows and the event or block open in it. */
export const params = {
  view: Nuqs.parseAsStringLiteral(Grid.views).withDefault("week"),
  date: day,
  item: Nuqs.parseAsString
}

const search = Nuqs.createSerializer(params)

/** The address of an event or a block, in the day view of the day it starts. */
export const itemUrl = (item: Grid.Item) => {
  const { id, start } = item.kind === "event" ? item.event : item.block
  return `${window.location.origin}${search("/calendar", { view: "day", date: start.slice(0, 10), item: id })}`
}
