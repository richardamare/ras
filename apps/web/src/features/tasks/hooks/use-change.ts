import * as ReactQuery from "@tanstack/react-query"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import * as UseSettled from "@/features/tasks/hooks/use-settled"
import type * as Api from "@/lib/api/generated/types.gen"

/** Saves one change to the task, leaving whatever the dialog's comment box holds. */
export const useChange = (id: string) => {
  const change = ReactQuery.useMutation({ ...Queries.workChangeTaskMutation(), ...UseSettled.useSettled() })
  return (body: Api.WorkChangeTaskData["body"], onSuccess?: () => void) => {
    change.mutate({ path: { id }, body }, onSuccess === undefined ? {} : { onSuccess })
  }
}
