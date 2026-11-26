import * as React from "react"
import * as ReactRouter from "@tanstack/react-router"

import * as ConfirmDialog from "@/components/confirm-dialog"
import * as MoveDialog from "@/features/board/components/move-dialog"
import * as BlockMoveDialog from "@/features/tasks/components/block-move-dialog"
import * as EventDialog from "@/features/calendar/components/event-dialog"
import * as NewTaskDialog from "@/features/tasks/components/new-task-dialog"
import * as TaskDialog from "@/features/tasks/components/task-dialog"
import * as WorkActions from "@/features/tasks/components/work-actions"

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
      <Slot useStore={NewTaskDialog.useNewTaskDialog} component={NewTaskDialog.NewTaskDialog} />
      <Slot useStore={MoveDialog.useMoveDialog} component={MoveDialog.MoveDialog} />
      <Slot useStore={EventDialog.useEventDialog} component={EventDialog.EventDialog} />
      <Slot useStore={BlockMoveDialog.useBlockMoveDialog} component={BlockMoveDialog.BlockMoveDialog} />
      <Slot useStore={WorkActions.useBlockDialog} component={WorkActions.BlockDialog} />
      <Slot useStore={ConfirmDialog.useConfirmDialog} component={ConfirmDialog.ConfirmDialog} />
    </>
  )
}
