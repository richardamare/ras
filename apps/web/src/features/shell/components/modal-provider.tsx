import * as React from "react"
import * as ReactRouter from "@tanstack/react-router"

import * as ConfirmDialog from "@/components/confirm-dialog"
import * as UseConfirmDialog from "@/hooks/use-confirm-dialog"
import * as MoveDialog from "@/features/board/components/move-dialog"
import * as UseMoveDialog from "@/features/board/hooks/use-move-dialog"
import * as BlockMoveDialog from "@/features/tasks/components/block-move-dialog"
import * as UseBlockMoveDialog from "@/features/tasks/hooks/use-block-move-dialog"
import * as EventDialog from "@/features/calendar/components/event-dialog"
import * as UseEventDialog from "@/features/calendar/hooks/use-event-dialog"
import * as NewTaskDialog from "@/features/tasks/components/new-task-dialog"
import * as UseNewTaskDialog from "@/features/tasks/hooks/use-new-task-dialog"
import * as TaskDialog from "@/features/tasks/components/task-dialog"
import * as WorkActions from "@/features/tasks/components/work-actions"
import * as UseBlockDialog from "@/features/tasks/hooks/use-block-dialog"

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface SlotProps<Data> {
  useStore: () => {
    isOpen: boolean
    data: Data | null
    opened: number
    close: () => void
    onOpenChange: (open: boolean) => void
  }
  component: React.ComponentType<ModalProps & Data>
}

/** One dialog bound to its store, keyed by each open so its form starts fresh; leaving the page closes it. */
function Slot<Data>({ useStore, component: Component }: SlotProps<Data>) {
  const store = useStore()
  const { close } = store
  const pathname = ReactRouter.useRouterState({ select: (state) => state.location.pathname })
  const shownOn = React.useRef(pathname)

  React.useEffect(() => {
    if (shownOn.current === pathname) return
    shownOn.current = pathname
    close()
  }, [pathname, close])

  if (store.data === null) return null
  return <Component key={store.opened} {...store.data} open={store.isOpen} onOpenChange={store.onOpenChange} />
}

/**
 * Every dialog of the console, mounted once. Open one through its store, such as `useNewTaskDialog().open({})`; the
 * task dialog opens from the address instead, so a link reaches it.
 */
export function ModalProvider() {
  return (
    <>
      <TaskDialog.TaskDialog />
      <Slot useStore={UseNewTaskDialog.useNewTaskDialog} component={NewTaskDialog.NewTaskDialog} />
      <Slot useStore={UseMoveDialog.useMoveDialog} component={MoveDialog.MoveDialog} />
      <Slot useStore={UseEventDialog.useEventDialog} component={EventDialog.EventDialog} />
      <Slot useStore={UseBlockMoveDialog.useBlockMoveDialog} component={BlockMoveDialog.BlockMoveDialog} />
      <Slot useStore={UseBlockDialog.useBlockDialog} component={WorkActions.BlockDialog} />
      <Slot useStore={UseConfirmDialog.useConfirmDialog} component={ConfirmDialog.ConfirmDialog} />
    </>
  )
}
