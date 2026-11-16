import * as ReactRouter from "@tanstack/react-router"
import * as ReactI18next from "react-i18next"

import * as NavEntries from "@/components/nav-entries"
import * as NavItem from "@/components/nav-item"
import * as RasMark from "@/components/ras-mark"
import * as Sidebar from "@/components/ui/sidebar"

export const AppSidebar = () => {
  const { t } = ReactI18next.useTranslation("@App")
  const navSections = NavEntries.useNavSections()
  const pathname = ReactRouter.useRouterState({ select: (state) => state.location.pathname })

  return (
    // Positioned in the shell rather than the window, so the environment banner above it stays visible.
    <Sidebar.Sidebar collapsible="icon" className="absolute h-full">
      <Sidebar.SidebarHeader>
        <div className="flex h-12 items-center gap-2 overflow-hidden p-2 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0">
          <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-primary">
            <RasMark.RasMark className="size-5 text-primary-foreground" />
          </div>
          <div className="grid flex-1 text-left leading-tight">
            <span className="truncate text-sm font-semibold">{t("name")}</span>
            <span className="truncate text-xs text-muted-foreground">{t("tagline")}</span>
          </div>
        </div>
      </Sidebar.SidebarHeader>

      <Sidebar.SidebarContent>
        {navSections.map((section) => (
          <Sidebar.SidebarGroup key={section.label}>
            <Sidebar.SidebarGroupLabel>{section.label}</Sidebar.SidebarGroupLabel>
            <Sidebar.SidebarGroupContent>
              <Sidebar.SidebarMenu>
                {section.entries.map((entry) => (
                  <NavItem.NavItem key={entry.to} entry={entry} pathname={pathname} />
                ))}
              </Sidebar.SidebarMenu>
            </Sidebar.SidebarGroupContent>
          </Sidebar.SidebarGroup>
        ))}
      </Sidebar.SidebarContent>

      <Sidebar.SidebarRail />
    </Sidebar.Sidebar>
  )
}
