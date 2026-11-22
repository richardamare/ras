import * as Nuqs from "nuqs"
import * as Zod from "zod"

import * as Url from "@/features/insights/url"

const key = "ras-insights-calendars"
const Stored = Zod.array(Zod.number().int())

const read = (): ReadonlyArray<number> => {
  try {
    const stored = Stored.safeParse(JSON.parse(localStorage.getItem(key) ?? "[]"))
    return stored.success ? stored.data : []
  } catch {
    return []
  }
}

/**
 * The calendars the address names, or without them the ones this browser last ticked that the page still lists; until
 * the list arrives, every remembered one.
 */
export const chosenOf = (
  fromUrl: ReadonlyArray<number> | null,
  stored: ReadonlyArray<number>,
  listed: ReadonlyArray<number> | undefined
) => fromUrl ?? (listed === undefined ? stored : stored.filter((id) => listed.includes(id)))

export const toggled = (chosen: ReadonlyArray<number>, calendar: number): ReadonlyArray<number> =>
  (chosen.includes(calendar) ? chosen.filter((one) => one !== calendar) : [...chosen, calendar]).toSorted(
    (a, b) => a - b
  )

/** The calendars ticked on the Insights page, kept in the address and remembered in this browser. */
export const useChosenCalendars = (listed: ReadonlyArray<number> | undefined) => {
  const [{ calendar }, setUrl] = Nuqs.useQueryStates(Url.params)
  const chosen = chosenOf(calendar, read(), listed)
  const toggle = (id: number) => {
    const next = toggled(chosen, id)
    localStorage.setItem(key, JSON.stringify(next))
    void setUrl({ calendar: [...next] }, { history: "push" })
  }
  return { chosen, toggle }
}
