import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"

import * as IconButton from "@/components/icon-button"
import * as Sidebar from "@/components/ui/sidebar"
import * as UserMenu from "@/components/user-menu"

export const AppHeader = () => {
  const { t } = ReactI18next.useTranslation("@Sidebar")
  const { state, isMobile, toggleSidebar } = Sidebar.useSidebar()

  // On mobile the sidebar is a sheet that covers this button, so the button only ever opens it.
  const expanded = !isMobile && state === "expanded"

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-2">
      <IconButton.IconButton
        label={expanded ? t("collapseSidebar") : t("expandSidebar")}
        className="shrink-0 text-muted-foreground"
        onClick={toggleSidebar}
      >
        <LucideReact.PanelLeftIcon />
      </IconButton.IconButton>
      <div className="min-w-0 flex-1" />
      <UserMenu.UserMenu />
    </header>
  )
}
