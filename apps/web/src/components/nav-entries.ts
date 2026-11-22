import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"

export type NavChild = {
  to: string
  label: string
  /** Active only on this exact path, for a child that is also the parent's landing page. */
  exact?: boolean
}

export type NavEntry = {
  to: string
  label: string
  icon: LucideReact.LucideIcon
  /** Sub-pages, nested under the parent in the sidebar. */
  children?: NavChild[]
}

export type NavSection = {
  label: string
  entries: NavEntry[]
}

export const useNavSections = (): NavSection[] => {
  const { t } = ReactI18next.useTranslation("@Sidebar")

  return [
    {
      label: t("sectionConsole"),
      entries: [
        { to: "/", label: t("home"), icon: LucideReact.HouseIcon },
        { to: "/board", label: t("board"), icon: LucideReact.KanbanIcon },
        { to: "/tasks", label: t("tasks"), icon: LucideReact.ListTodoIcon },
        { to: "/calendar", label: t("calendar"), icon: LucideReact.CalendarDaysIcon },
        { to: "/insights", label: t("insights"), icon: LucideReact.ChartColumnIcon },
        { to: "/projects", label: t("projects"), icon: LucideReact.FolderKanbanIcon },
        {
          to: "/settings",
          label: t("settings"),
          icon: LucideReact.SettingsIcon,
          children: [
            { to: "/settings", label: t("settingsGeneral"), exact: true },
            { to: "/settings/calendars", label: t("settingsCalendars") },
            { to: "/settings/connections", label: t("settingsConnections") }
          ]
        }
      ]
    }
  ]
}
