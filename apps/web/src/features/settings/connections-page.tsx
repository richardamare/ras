import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"

import * as Badge from "@/components/ui/badge"
import * as Button from "@/components/ui/button"
import * as Skeleton from "@/components/ui/skeleton"
import * as SettingsSection from "@/features/settings/settings-section"
import * as Work from "@/features/tasks/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import type * as Api from "@/lib/api/generated/types.gen"

type Kind = Api.SourceConnectionEncoded["kind"]
type State = Api.SourceConnectionEncoded["state"]

const icons: Record<Kind, LucideReact.LucideIcon> = {
  outlook: LucideReact.CalendarIcon,
  reclaim: LucideReact.CalendarSyncIcon,
  icloud: LucideReact.InboxIcon,
  github: LucideReact.GitBranchIcon
}

const badges: Record<State, "secondary" | "outline" | "destructive"> = {
  connected: "secondary",
  notConfigured: "outline",
  failing: "destructive",
  sample: "outline"
}

function ConnectOutlook({ connected }: { connected: boolean }) {
  const { t } = ReactI18next.useTranslation("Settings")
  const connect = ReactQuery.useMutation({
    ...Queries.globalConnectGraphMutation(),
    onSuccess: (result) => window.location.assign(result.url),
    onError: (error) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  })
  return (
    <Button.Button size="sm" variant="outline" disabled={connect.isPending} onClick={() => connect.mutate({})}>
      {t(connected ? "connections.reconnect" : "connections.connect")}
    </Button.Button>
  )
}

function ConnectionRow({ connection }: { connection: Api.SourceConnectionEncoded }) {
  const { t } = ReactI18next.useTranslation("Settings")
  const [checked, setChecked] = React.useState<Api.SourceConnectionEncoded | null>(null)
  const check = ReactQuery.useMutation({
    ...Queries.globalCheckConnectionMutation(),
    onSuccess: setChecked,
    onError: (error) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  })
  const shown = checked ?? connection
  const Icon = icons[shown.kind]

  return (
    <SettingsSection.Row>
      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      <span className="font-medium">{t(`connections.kind.${shown.kind}`)}</span>
      <Badge.Badge variant={badges[shown.state]}>{t(`connections.state.${shown.state}`)}</Badge.Badge>
      <span className="ms-auto flex items-center gap-2">
        {shown.kind === "outlook" && shown.state !== "sample" && (
          <ConnectOutlook connected={shown.state !== "notConfigured"} />
        )}
        {shown.state !== "sample" && shown.state !== "notConfigured" && (
          <Button.Button
            size="sm"
            variant="ghost"
            disabled={check.isPending}
            onClick={() => check.mutate({ path: { kind: shown.kind } })}
          >
            <LucideReact.RefreshCwIcon className={check.isPending ? "animate-spin" : undefined} />
            {t("connections.check")}
          </Button.Button>
        )}
      </span>
      {shown.detail !== null && (
        <p
          className={`basis-full text-sm break-words ${shown.state === "failing" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {shown.detail}
        </p>
      )}
    </SettingsSection.Row>
  )
}

export function ConnectionsPage() {
  const { t } = ReactI18next.useTranslation("Settings")
  const connections = ReactQuery.useQuery(Queries.globalConnectionsOptions())

  return (
    <div className="grid max-w-4xl gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <SettingsSection.Section title={t("connections.title")} description={t("connections.description")}>
        {connections.isPending && <Skeleton.Skeleton className="h-24" />}
        {(connections.data ?? []).map((connection) => (
          <ConnectionRow key={connection.kind} connection={connection} />
        ))}
      </SettingsSection.Section>
    </div>
  )
}
