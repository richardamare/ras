import * as ReactRouter from "@tanstack/react-router"
import * as Zod from "zod"

import * as CalendarPage from "@/features/calendar/calendar-page"
import * as Grid from "@/features/calendar/grid"

const search = Zod.object({
  view: Zod.enum(Grid.views).catch("week"),
  date: Zod.iso.date().optional().catch(undefined)
})

function Calendar() {
  const { view, date } = Route.useSearch()
  return <CalendarPage.CalendarPage view={view} date={date} />
}

export const Route = ReactRouter.createFileRoute("/_shell/calendar")({
  validateSearch: search,
  component: Calendar
})
