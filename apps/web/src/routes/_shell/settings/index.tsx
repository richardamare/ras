import * as ReactRouter from "@tanstack/react-router"

import * as SettingsPage from "@/features/settings/components/settings-page"

export const Route = ReactRouter.createFileRoute("/_shell/settings/")({
  component: SettingsPage.SettingsPage
})
