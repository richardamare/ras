import * as ReactRouter from "@tanstack/react-router"

import * as CalendarsPage from "@/features/settings/components/calendars-page"

export const Route = ReactRouter.createFileRoute("/_shell/settings/calendars")({
  component: CalendarsPage.CalendarsPage
})
