import * as ReactRouter from "@tanstack/react-router"

import * as HomePage from "@/features/home/home-page"

export const Route = ReactRouter.createFileRoute("/_shell/")({
  component: HomePage.HomePage
})
