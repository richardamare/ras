import type * as React from "react"
import * as ReactRouter from "@tanstack/react-router"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"

import * as Button from "@/components/ui/button"
import * as Empty from "@/components/ui/empty"

/** Anything not listed falls through to `default` - a user-facing page is the wrong place to
 * leak an internal reason. */
type ErrorKey = "400" | "403" | "404" | "offline" | "default"

const ICONS: Record<ErrorKey, React.ComponentType> = {
  "400": LucideReact.CircleAlertIcon,
  "403": LucideReact.BanIcon,
  "404": LucideReact.SearchXIcon,
  offline: LucideReact.WifiOffIcon,
  default: LucideReact.TriangleAlertIcon
}

const BY_CODE: Partial<Record<number, ErrorKey>> = { 400: "400", 403: "403", 404: "404" }

const errorKey = (code: number | undefined, offline: boolean | undefined): ErrorKey => {
  if (offline) return "offline"
  return (code === undefined ? undefined : BY_CODE[code]) ?? "default"
}

type ErrorStateProps = {
  code?: number
  /** `ApiProblem.isOffline` — the request never reached the API, which is the user's to act on. */
  offline?: boolean
  /** Underlying detail. Shown verbatim, so keep it short and non-sensitive. */
  detail?: string | undefined
  className?: string
}

export const ErrorState = (props: ErrorStateProps) => {
  const { code, offline, detail, className } = props
  const { t } = ReactI18next.useTranslation("@ModuleError")
  const router = ReactRouter.useRouter()

  const key = errorKey(code, offline)
  const Icon = ICONS[key]

  return (
    <Empty.Empty className={className}>
      <Empty.EmptyHeader>
        <Empty.EmptyMedia variant="icon">
          <Icon />
        </Empty.EmptyMedia>
        <Empty.EmptyTitle>{t(`${key}.title`)}</Empty.EmptyTitle>
        <Empty.EmptyDescription>{t(`${key}.message`)}</Empty.EmptyDescription>
      </Empty.EmptyHeader>

      <Empty.EmptyContent>
        {detail && (
          <pre className="max-w-full overflow-x-auto rounded-md bg-muted p-3 text-left text-xs text-muted-foreground select-text">
            {detail}
          </pre>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Button.Button variant="outline" onClick={() => router.history.back()}>
            <LucideReact.ArrowLeftIcon />
            {t("back")}
          </Button.Button>
          <Button.Button onClick={() => void router.navigate({ to: "/" })}>
            <LucideReact.HouseIcon />
            {t("home")}
          </Button.Button>
        </div>
      </Empty.EmptyContent>
    </Empty.Empty>
  )
}

/**
 * Uses `window.location`, not the router: the router may be the thing that died, and reaching for
 * `ReactRouter.useRouter()` here turns a recoverable crash into a blank page.
 */
export const AppCrash = (props: { detail?: string | undefined }) => {
  const { detail } = props
  const { t } = ReactI18next.useTranslation("@CoreError")

  return (
    <Empty.Empty>
      <Empty.EmptyHeader>
        <Empty.EmptyMedia variant="icon" className="bg-destructive/10 text-destructive">
          <LucideReact.TriangleAlertIcon />
        </Empty.EmptyMedia>
        <Empty.EmptyTitle>{t("title")}</Empty.EmptyTitle>
        <Empty.EmptyDescription>
          {t("message.row1")} {t("message.row2")}
        </Empty.EmptyDescription>
      </Empty.EmptyHeader>

      <Empty.EmptyContent>
        {detail && (
          <pre className="max-w-full overflow-x-auto rounded-md bg-muted p-3 text-left text-xs text-muted-foreground select-text">
            {detail}
          </pre>
        )}
        <Button.Button onClick={() => window.location.reload()}>
          <LucideReact.RotateCwIcon />
          {t("reload")}
        </Button.Button>
      </Empty.EmptyContent>
    </Empty.Empty>
  )
}
