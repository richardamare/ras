import * as ReactRouter from "@tanstack/react-router"
import * as Nuqs from "nuqs"

import * as CalendarPage from "@/features/calendar/components/calendar-page"
import * as Url from "@/features/calendar/lib/url"

export const Route = ReactRouter.createFileRoute("/_shell/calendar")({
  validateSearch: Nuqs.createStandardSchemaV1(Url.params, { partialOutput: true }),
  component: CalendarPage.CalendarPage
})
