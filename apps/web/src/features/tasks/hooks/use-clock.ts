import * as ReactQuery from "@tanstack/react-query"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import * as UseSettled from "@/features/tasks/hooks/use-settled"

/** Starting and stopping the clock on a task. Only one block runs at a time, and the API refuses a second. */
export const useClock = () => {
  const settled = UseSettled.useSettled()
  const running = ReactQuery.useQuery(Queries.workRunningOptions())
  const start = ReactQuery.useMutation({ ...Queries.workStartMutation(), ...settled })
  const stop = ReactQuery.useMutation({ ...Queries.workStopMutation(), ...settled })
  const block = running.data ?? null
  return {
    runs: (task: string) => block?.task === task,
    start: (task: string) => start.mutate({ body: { task } }),
    stop: () => stop.mutate({}),
    busy: start.isPending || stop.isPending
  }
}
