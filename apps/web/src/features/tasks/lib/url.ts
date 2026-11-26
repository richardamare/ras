import * as Nuqs from "nuqs"

/** The task open over any page, and the comment in it a link points at. */
export const params = { task: Nuqs.parseAsString, comment: Nuqs.parseAsString }

const search = Nuqs.createSerializer(params)

/** The address of a task, or of one of its comments, on the Tasks page. */
export const taskUrl = (task: string, comment?: string) =>
  `${window.location.origin}${search("/tasks", { task, comment: comment ?? null })}`
