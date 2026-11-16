import * as LucideReact from "lucide-react"
import * as NextThemes from "next-themes"
import * as ReactI18next from "react-i18next"

import * as DropdownMenu from "@/components/ui/dropdown-menu"

/**
 * Theme picker, shaped as a submenu so it can sit inside the user menu rather than spending a
 * slot in the header.
 */
export const ModeToggle = () => {
  const { t } = ReactI18next.useTranslation("translation")
  const { theme, setTheme } = NextThemes.useTheme()

  return (
    <DropdownMenu.DropdownMenuSub>
      <DropdownMenu.DropdownMenuSubTrigger>
        <LucideReact.SunIcon className="size-4 dark:hidden" aria-hidden />
        <LucideReact.MoonIcon className="hidden size-4 dark:block" aria-hidden />
        <span>{t("theme")}</span>
      </DropdownMenu.DropdownMenuSubTrigger>
      <DropdownMenu.DropdownMenuSubContent>
        <DropdownMenu.DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenu.DropdownMenuRadioItem value="light">
            <LucideReact.SunIcon className="size-4" aria-hidden />
            {t("themeLight")}
          </DropdownMenu.DropdownMenuRadioItem>
          <DropdownMenu.DropdownMenuRadioItem value="dark">
            <LucideReact.MoonIcon className="size-4" aria-hidden />
            {t("themeDark")}
          </DropdownMenu.DropdownMenuRadioItem>
          <DropdownMenu.DropdownMenuRadioItem value="system">
            <LucideReact.MonitorIcon className="size-4" aria-hidden />
            {t("themeSystem")}
          </DropdownMenu.DropdownMenuRadioItem>
        </DropdownMenu.DropdownMenuRadioGroup>
      </DropdownMenu.DropdownMenuSubContent>
    </DropdownMenu.DropdownMenuSub>
  )
}
