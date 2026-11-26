import * as ReactRouter from "@tanstack/react-router"
import * as Nuqs from "nuqs"

import * as InsightsPage from "@/features/insights/components/insights-page"
import * as Url from "@/features/insights/lib/url"

export const Route = ReactRouter.createFileRoute("/_shell/insights")({
  validateSearch: Nuqs.createStandardSchemaV1(Url.periodParams, { partialOutput: true }),
  component: InsightsPage.InsightsPage
})
