import * as ReactRouter from "@tanstack/react-router"

import * as ProjectsPage from "@/features/projects/components/projects-page"

export const Route = ReactRouter.createFileRoute("/_shell/projects/")({
  component: ProjectsPage.ProjectsPage
})
