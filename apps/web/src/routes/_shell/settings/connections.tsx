import * as ReactRouter from "@tanstack/react-router"

import * as ConnectionsPage from "@/features/settings/components/connections-page"

export const Route = ReactRouter.createFileRoute("/_shell/settings/connections")({
  component: ConnectionsPage.ConnectionsPage
})
