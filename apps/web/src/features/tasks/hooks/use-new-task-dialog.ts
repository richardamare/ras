import type * as Work from "@/features/tasks/lib/work"
import * as DialogStore from "@/lib/dialog-store"

export interface Preset {
  /** Preselects the project. */
  readonly project?: string
  /** The column the task starts in; left out, the API's default. */
  readonly status?: Work.Status
}

export const useNewTaskDialog = DialogStore.createDialogStore<Preset>()
