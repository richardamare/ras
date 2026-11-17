import * as ReactRouter from "@tanstack/react-router"

import * as ProjectPage from "@/features/projects/project-page"

function Project() {
  const { id } = Route.useParams()
  return <ProjectPage.ProjectPage id={id} />
}

export const Route = ReactRouter.createFileRoute("/_shell/projects/$id")({
  component: Project
})
