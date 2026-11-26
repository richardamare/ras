import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"

import * as Environment from "@/lib/environment"
import * as Utils from "@/lib/utils"

type EnvironmentBannerProps = {
  className?: string
}

/** Renders nothing in production, which is why callers place it unconditionally. */
export const EnvironmentBanner = (props: EnvironmentBannerProps) => {
  const { className } = props
  const { t } = ReactI18next.useTranslation("@App")

  if (Environment.isProduction()) return null

  const testing = Environment.isTesting()

  return (
    <div
      data-slot="env-banner"
      className={Utils.cn(
        "flex items-center justify-center gap-1.5 border-b px-3 py-1.5 text-xs font-medium tracking-wide uppercase [&_svg]:size-3.5",
        testing ? "bg-muted text-muted-foreground" : "bg-destructive/10 text-destructive",
        className
      )}
    >
      {testing ? <LucideReact.ZapIcon /> : <LucideReact.WrenchIcon />}
      {testing ? t("testEnvironment") : t("devEnvironment")}
    </div>
  )
}
