import * as Nuqs from "nuqs"
import * as HiddenCalendars from "@/features/calendar/lib/hidden-calendars"
import * as Url from "@/features/insights/lib/url"
import * as ChosenCalendars from "@/features/insights/lib/chosen-calendars"

/** The calendars ticked on the Insights page, kept in the address and remembered in this browser. */
export const useChosenCalendars = (listed: ReadonlyArray<number> | undefined) => {
  const [{ calendar }, setUrl] = Nuqs.useQueryStates(Url.params)
  const chosen = ChosenCalendars.chosenOf(calendar, HiddenCalendars.storedCalendars(ChosenCalendars.key), listed)
  const toggle = (id: number) => {
    const next = ChosenCalendars.toggled(chosen, id)
    localStorage.setItem(ChosenCalendars.key, JSON.stringify(next))
    void setUrl({ calendar: [...next] }, { history: "push" })
  }
  return { chosen, toggle }
}
