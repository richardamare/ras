import * as ReactRouter from "@tanstack/react-router"

import * as AppShell from "@/components/app-shell"

export const Route = ReactRouter.createFileRoute("/_shell")({
  component: AppShell.AppShell
})
