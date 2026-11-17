import * as ReactRouter from "@tanstack/react-router"

import * as BoardPage from "@/features/board/board-page"

export const Route = ReactRouter.createFileRoute("/_shell/board")({
  component: BoardPage.BoardPage
})
