import * as UseTaskParams from "@/features/tasks/hooks/use-task-params"

export const useOpenTask = () => {
  const [, set] = UseTaskParams.useTaskParams()
  return (task: string) => void set({ task, comment: null }, { history: "push" })
}
