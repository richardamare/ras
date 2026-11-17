import * as Zustand from "zustand"
import * as ZustandVanilla from "zustand/vanilla"

interface DialogState<Data> {
  readonly isOpen: boolean
  readonly data: Data | null
  /** Counts the opens; the modal provider keys by it, so each open starts with fresh form state. */
  readonly opened: number
}

/** A dialog's open state and the data it opened with; `data` outlives `close()`, so the exit animation keeps it. */
export const createDialogStore = <Data = void>() => {
  const store = ZustandVanilla.createStore<DialogState<Data>>()(() => ({ isOpen: false, data: null, opened: 0 }))
  const open = (data: Data) => store.setState((state) => ({ isOpen: true, data, opened: state.opened + 1 }))
  const close = () => store.setState({ isOpen: false })
  const onOpenChange = (next: boolean) => {
    if (!next) close()
  }
  return () => ({ ...Zustand.useStore(store), open, close, onOpenChange })
}
