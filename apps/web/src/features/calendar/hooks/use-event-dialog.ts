import type * as Api from "@/lib/api/generated/types.gen"
import type * as Pointer from "@/features/calendar/lib/pointer"
import * as DialogStore from "@/lib/dialog-store"

export type DialogState =
  | { readonly kind: "create"; readonly placement: Pointer.Placement; readonly draft: boolean }
  | { readonly kind: "edit"; readonly event: Api.EventEncoded }

export const useEventDialog = DialogStore.createDialogStore<{ state: DialogState }>()
