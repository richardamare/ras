import * as ReactRouter from "@tanstack/react-router"

import * as BoardPage from "@/features/board/components/board-page"

export const Route = ReactRouter.createFileRoute("/_shell/board")({
  component: BoardPage.BoardPage
})
