import * as React from "react"
import * as ReactRouter from "@tanstack/react-router"
import * as LucideReact from "lucide-react"

import type * as NavEntries from "@/components/nav-entries"
import * as Collapsible from "@/components/ui/collapsible"
import * as Sidebar from "@/components/ui/sidebar"

type NavItemProps = {
  entry: NavEntries.NavEntry
  pathname: string
}

export const NavItem = ({ entry, pathname }: NavItemProps) => {
  const { state, isMobile } = Sidebar.useSidebar()

  const active = entry.to === "/" ? pathname === "/" : pathname.startsWith(entry.to)

  const [open, setOpen] = React.useState(active)
  const [wasActive, setWasActive] = React.useState(active)

  // Entering the section opens it; leaving it keeps whatever the user last chose.
  if (active !== wasActive) {
    setWasActive(active)
    if (active) setOpen(true)
  }

  // An icon-only rail has nowhere to unfold the sub-entries, so the parent is a plain link there.
  if (entry.children === undefined || (state === "collapsed" && !isMobile))
    return (
      <Sidebar.SidebarMenuItem>
        <Sidebar.SidebarMenuButton asChild tooltip={entry.label} isActive={active}>
          <ReactRouter.Link to={entry.to}>
            <entry.icon />
            <span>{entry.label}</span>
          </ReactRouter.Link>
        </Sidebar.SidebarMenuButton>
      </Sidebar.SidebarMenuItem>
    )

  return (
    <Collapsible.Collapsible asChild open={open} onOpenChange={setOpen} className="group/collapsible">
      <Sidebar.SidebarMenuItem>
        <Collapsible.CollapsibleTrigger asChild>
          <Sidebar.SidebarMenuButton tooltip={entry.label} isActive={active}>
            <entry.icon />
            <span>{entry.label}</span>
            <LucideReact.ChevronRightIcon className="ml-auto transition-transform duration-150 group-data-[state=open]/collapsible:rotate-90" />
          </Sidebar.SidebarMenuButton>
        </Collapsible.CollapsibleTrigger>

        <Collapsible.CollapsibleContent>
          <Sidebar.SidebarMenuSub>
            {entry.children.map((child) => (
              <Sidebar.SidebarMenuSubItem key={child.to}>
                <Sidebar.SidebarMenuSubButton
                  asChild
                  isActive={child.exact === true ? pathname === child.to : pathname.startsWith(child.to)}
                >
                  <ReactRouter.Link to={child.to}>
                    <span>{child.label}</span>
                  </ReactRouter.Link>
                </Sidebar.SidebarMenuSubButton>
              </Sidebar.SidebarMenuSubItem>
            ))}
          </Sidebar.SidebarMenuSub>
        </Collapsible.CollapsibleContent>
      </Sidebar.SidebarMenuItem>
    </Collapsible.Collapsible>
  )
}
