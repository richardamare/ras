import * as ReactRouter from "@tanstack/react-router"

import * as TasksPage from "@/features/tasks-table/components/tasks-page"

export const Route = ReactRouter.createFileRoute("/_shell/tasks")({
  component: TasksPage.TasksPage
})
