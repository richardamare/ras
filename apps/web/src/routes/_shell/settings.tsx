import * as ReactRouter from "@tanstack/react-router"

export const Route = ReactRouter.createFileRoute("/_shell/settings")({
  component: ReactRouter.Outlet
})
