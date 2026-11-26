import * as ReactRouter from "@tanstack/react-router"
import * as Nuqs from "nuqs"

import * as AppShell from "@/features/shell/components/app-shell"
import * as TaskUrl from "@/features/tasks/lib/url"

export const Route = ReactRouter.createFileRoute("/_shell")({
  validateSearch: Nuqs.createStandardSchemaV1(TaskUrl.params, { partialOutput: true }),
  component: AppShell.AppShell
})
