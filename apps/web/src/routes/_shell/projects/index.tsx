import * as ReactRouter from "@tanstack/react-router"

import * as ProjectsPage from "@/features/projects/projects-page"

export const Route = ReactRouter.createFileRoute("/_shell/projects/")({
  component: ProjectsPage.ProjectsPage
})
