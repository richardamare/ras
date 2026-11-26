import * as Nuqs from "nuqs"
import * as Url from "@/features/tasks/lib/url"

export const useTaskParams = () => Nuqs.useQueryStates(Url.params)
