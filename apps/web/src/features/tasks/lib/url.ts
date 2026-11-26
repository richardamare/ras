import * as Nuqs from "nuqs"

/** The task open over any page, and the comment in it a link points at. */
export const params = { task: Nuqs.parseAsString, comment: Nuqs.parseAsString }

export const useTaskParams = () => Nuqs.useQueryStates(params)

export const useOpenTask = () => {
  const [, set] = useTaskParams()
  return (task: string) => void set({ task, comment: null }, { history: "push" })
}

const search = Nuqs.createSerializer(params)

/** The address of a task, or of one of its comments, on the Tasks page. */
export const taskUrl = (task: string, comment?: string) =>
  `${window.location.origin}${search("/tasks", { task, comment: comment ?? null })}`
