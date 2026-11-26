import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"

import * as IconButton from "@/components/icon-button"
import * as ModeToggle from "@/features/shell/components/mode-toggle"
import * as Avatar from "@/components/ui/avatar"
import * as DropdownMenu from "@/components/ui/dropdown-menu"
import * as Auth from "@/lib/auth"

export const UserMenu = () => {
  const { t } = ReactI18next.useTranslation("@Navbar")
  const { data: session } = Auth.authClient.useSession()
  const email = session?.user.email ?? ""

  return (
    <DropdownMenu.DropdownMenu>
      <DropdownMenu.DropdownMenuTrigger asChild>
        <IconButton.IconButton label={t("accountMenu")} className="shrink-0 rounded-full">
          <Avatar.Avatar className="size-7">
            <Avatar.AvatarFallback className="bg-primary text-[11px] font-medium text-primary-foreground">
              {email.charAt(0).toUpperCase()}
            </Avatar.AvatarFallback>
          </Avatar.Avatar>
        </IconButton.IconButton>
      </DropdownMenu.DropdownMenuTrigger>

      <DropdownMenu.DropdownMenuContent align="end" sideOffset={4} className="w-64">
        <DropdownMenu.DropdownMenuLabel className="truncate text-sm font-medium text-foreground">
          {email}
        </DropdownMenu.DropdownMenuLabel>
        <DropdownMenu.DropdownMenuSeparator />
        <DropdownMenu.DropdownMenuGroup>
          <ModeToggle.ModeToggle />
        </DropdownMenu.DropdownMenuGroup>
        <DropdownMenu.DropdownMenuSeparator />
        <DropdownMenu.DropdownMenuGroup>
          <DropdownMenu.DropdownMenuItem variant="destructive" onSelect={() => void Auth.authClient.signOut()}>
            <LucideReact.LogOutIcon />
            {t("logout")}
          </DropdownMenu.DropdownMenuItem>
        </DropdownMenu.DropdownMenuGroup>
      </DropdownMenu.DropdownMenuContent>
    </DropdownMenu.DropdownMenu>
  )
}
