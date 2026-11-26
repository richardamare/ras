import * as ReactQuery from "@tanstack/react-query"
import * as ReactI18next from "react-i18next"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"

/** The name an assignee goes by: "you" for the owner, an agent's display name for an agent. */
export const useAssignee = () => {
  const { t } = ReactI18next.useTranslation("Work")
  const agents = ReactQuery.useQuery(Queries.globalAgentsOptions())
  const names = new Map((agents.data ?? []).map((agent) => [agent.slug, agent.name]))
  return (assignee: string) => (assignee === "owner" ? t("owner") : (names.get(assignee) ?? assignee))
}
