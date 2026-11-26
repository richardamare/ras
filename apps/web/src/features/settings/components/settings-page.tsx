import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"

import * as Badge from "@/components/ui/badge"
import * as ConfirmDialog from "@/components/confirm-dialog"
import * as Button from "@/components/ui/button"
import * as Input from "@/components/ui/input"
import * as Select from "@/components/ui/select"
import * as Skeleton from "@/components/ui/skeleton"
import * as SettingsSection from "@/features/settings/components/settings-section"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import type * as Api from "@/lib/api/generated/types.gen"

const noCalendar = "none"

function SpaceRow({ space, calendars }: { space: Api.SpaceEncoded; calendars: ReadonlyArray<Api.CalendarEncoded> }) {
  const { t } = ReactI18next.useTranslation("Settings")
  const settle = SettingsSection.useSettle()
  const change = ReactQuery.useMutation({ ...Queries.workChangeSpaceMutation(), ...settle })
  const archive = ReactQuery.useMutation({ ...Queries.workArchiveSpaceMutation(), ...settle })
  const [name, setName] = React.useState(space.name)
  const writable = calendars.filter((calendar) => calendar.writable && calendar.enabled)

  return (
    <SettingsSection.Row muted={space.archived}>
      <input
        type="color"
        aria-label={t("spaces.color")}
        value={space.color}
        disabled={space.archived}
        onChange={(event) => change.mutate({ path: { id: space.id }, body: { color: event.target.value } })}
        className="size-7 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
      />
      <Input.Input
        aria-label={t("spaces.name")}
        value={name}
        disabled={space.archived}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          if (name.trim() !== "" && name !== space.name)
            change.mutate({ path: { id: space.id }, body: { name: name.trim() } })
        }}
        className="h-8 max-w-56"
      />
      <Select.Select
        value={space.calendar === null ? noCalendar : String(space.calendar)}
        disabled={space.archived}
        onValueChange={(value) =>
          change.mutate({ path: { id: space.id }, body: { calendar: value === noCalendar ? null : Number(value) } })
        }
      >
        <Select.SelectTrigger aria-label={t("spaces.calendar")} className="h-8 min-w-48">
          <Select.SelectValue />
        </Select.SelectTrigger>
        <Select.SelectContent>
          <Select.SelectItem value={noCalendar}>{t("spaces.noCalendar")}</Select.SelectItem>
          {writable.map((calendar) => (
            <Select.SelectItem key={calendar.id} value={String(calendar.id)}>
              {calendar.name}
            </Select.SelectItem>
          ))}
        </Select.SelectContent>
      </Select.Select>
      <span className="ms-auto flex items-center gap-2">
        {space.default ? (
          <Badge.Badge variant="secondary">{t("spaces.default")}</Badge.Badge>
        ) : space.archived ? (
          <Badge.Badge variant="outline">{t("spaces.archived")}</Badge.Badge>
        ) : (
          <>
            <Button.Button
              size="sm"
              variant="ghost"
              onClick={() => change.mutate({ path: { id: space.id }, body: { default: true } })}
            >
              {t("spaces.makeDefault")}
            </Button.Button>
            <Button.Button size="sm" variant="ghost" onClick={() => archive.mutate({ path: { id: space.id } })}>
              <LucideReact.ArchiveIcon />
              {t("spaces.archive")}
            </Button.Button>
          </>
        )}
      </span>
    </SettingsSection.Row>
  )
}

function Spaces() {
  const { t } = ReactI18next.useTranslation("Settings")
  const settle = SettingsSection.useSettle()
  const spaces = ReactQuery.useQuery(Queries.workSpacesOptions())
  const calendars = ReactQuery.useQuery(Queries.calendarCalendarsOptions())
  const add = ReactQuery.useMutation({ ...Queries.workAddSpaceMutation(), ...settle })
  const [name, setName] = React.useState("")
  const [color, setColor] = React.useState("#4f6bed")

  return (
    <SettingsSection.Section title={t("spaces.title")} description={t("spaces.description")}>
      {spaces.isPending && <Skeleton.Skeleton className="h-24" />}
      {(spaces.data ?? []).map((space) => (
        <SpaceRow key={space.id} space={space} calendars={calendars.data ?? []} />
      ))}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          add.mutate({ body: { name: name.trim(), color } }, { onSuccess: () => setName("") })
        }}
      >
        <input
          type="color"
          aria-label={t("spaces.color")}
          value={color}
          onChange={(event) => setColor(event.target.value)}
          className="size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
        />
        <Input.Input
          placeholder={t("spaces.newName")}
          aria-label={t("spaces.newName")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="max-w-56"
        />
        <Button.Button type="submit" variant="outline" disabled={name.trim() === "" || add.isPending}>
          <LucideReact.PlusIcon />
          {t("spaces.add")}
        </Button.Button>
      </form>
    </SettingsSection.Section>
  )
}

function Agents() {
  const { t } = ReactI18next.useTranslation("Settings")
  const settle = SettingsSection.useSettle()
  const agents = ReactQuery.useQuery(Queries.globalAgentsOptions())
  const add = ReactQuery.useMutation({ ...Queries.globalAddAgentMutation(), ...settle })
  const archive = ReactQuery.useMutation({ ...Queries.globalArchiveAgentMutation(), ...settle })
  const [slug, setSlug] = React.useState("")
  const [name, setName] = React.useState("")

  return (
    <SettingsSection.Section title={t("agents.title")} description={t("agents.description")}>
      {(agents.data ?? []).length === 0 && !agents.isPending && (
        <p className="text-sm text-muted-foreground">{t("agents.none")}</p>
      )}
      {(agents.data ?? []).map((agent) => (
        <SettingsSection.Row key={agent.slug} muted={agent.archived}>
          <LucideReact.BotIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium">{agent.name}</span>
          <code className="text-xs text-muted-foreground">{agent.slug}</code>
          {agent.archived ? (
            <Badge.Badge variant="outline" className="ms-auto">
              {t("agents.archived")}
            </Badge.Badge>
          ) : (
            <Button.Button
              size="sm"
              variant="ghost"
              className="ms-auto"
              onClick={() => archive.mutate({ path: { slug: agent.slug } })}
            >
              <LucideReact.ArchiveIcon />
              {t("agents.archive")}
            </Button.Button>
          )}
        </SettingsSection.Row>
      ))}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          add.mutate(
            { body: { slug: slug.trim(), name: name.trim() } },
            {
              onSuccess: () => {
                setSlug("")
                setName("")
              }
            }
          )
        }}
      >
        <Input.Input
          placeholder={t("agents.slug")}
          aria-label={t("agents.slug")}
          value={slug}
          onChange={(event) => setSlug(event.target.value.toLowerCase())}
          className="max-w-40"
        />
        <Input.Input
          placeholder={t("agents.name")}
          aria-label={t("agents.name")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="max-w-56"
        />
        <Button.Button
          type="submit"
          variant="outline"
          disabled={slug.trim() === "" || name.trim() === "" || add.isPending}
        >
          <LucideReact.PlusIcon />
          {t("agents.add")}
        </Button.Button>
      </form>
    </SettingsSection.Section>
  )
}

function Clients() {
  const { t } = ReactI18next.useTranslation("Settings")
  const settle = SettingsSection.useSettle()
  const clients = ReactQuery.useQuery(Queries.globalClientsOptions())
  const confirmDialog = ConfirmDialog.useConfirmDialog()
  const revoke = ReactQuery.useMutation({
    ...Queries.globalRevokeClientMutation(),
    ...settle
  })

  return (
    <SettingsSection.Section title={t("clients.title")} description={t("clients.description")}>
      {(clients.data ?? []).length === 0 && !clients.isPending && (
        <p className="text-sm text-muted-foreground">{t("clients.none")}</p>
      )}
      {(clients.data ?? []).map((client) => (
        <SettingsSection.Row key={client.id}>
          <LucideReact.PlugIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium">{client.name}</span>
          <span className="text-xs text-muted-foreground">
            {t("clients.connected", { at: client.connected.replace("T", " ") })}
            {client.used !== null && ` · ${t("clients.used", { at: client.used.replace("T", " ") })}`}
          </span>
          <Button.Button
            size="sm"
            variant="ghost"
            className="ms-auto text-destructive"
            onClick={() =>
              confirmDialog.open({
                title: t("clients.revokeTitle", { name: client.name }),
                description: t("clients.revokeDescription"),
                confirmLabel: t("clients.revoke"),
                cancelLabel: t("clients.keep"),
                destructive: true,
                onConfirm: () => revoke.mutate({ path: { id: client.id } })
              })
            }
          >
            {t("clients.revoke")}
          </Button.Button>
        </SettingsSection.Row>
      ))}
    </SettingsSection.Section>
  )
}

export function SettingsPage() {
  const { t } = ReactI18next.useTranslation("Settings")
  return (
    <div className="grid max-w-4xl gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <Spaces />
      <Agents />
      <Clients />
    </div>
  )
}
