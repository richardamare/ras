import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"

import * as Badge from "@/components/ui/badge"
import * as ConfirmDialog from "@/components/confirm-dialog"
import * as Button from "@/components/ui/button"
import * as Card from "@/components/ui/card"
import * as Input from "@/components/ui/input"
import * as Select from "@/components/ui/select"
import * as Skeleton from "@/components/ui/skeleton"
import * as Work from "@/features/tasks/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import type * as Api from "@/lib/api/generated/types.gen"

const noCalendar = "none"

/** Settles every write the same way: refetch on success, the refusal's reason on failure. */
const useSettle = () => {
  const { t } = ReactI18next.useTranslation("Settings")
  const client = ReactQuery.useQueryClient()
  return {
    onSuccess: () => client.invalidateQueries(),
    onError: (error: unknown) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  }
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card.Card>
      <Card.CardHeader>
        <Card.CardTitle>{title}</Card.CardTitle>
        <Card.CardDescription>{description}</Card.CardDescription>
      </Card.CardHeader>
      <Card.CardContent className="grid gap-3">{children}</Card.CardContent>
    </Card.Card>
  )
}

function Row({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 ${muted ? "opacity-60" : ""}`}>
      {children}
    </div>
  )
}

function SpaceRow({ space, calendars }: { space: Api.SpaceEncoded; calendars: ReadonlyArray<Api.CalendarEncoded> }) {
  const { t } = ReactI18next.useTranslation("Settings")
  const settle = useSettle()
  const change = ReactQuery.useMutation({ ...Queries.workChangeSpaceMutation(), ...settle })
  const archive = ReactQuery.useMutation({ ...Queries.workArchiveSpaceMutation(), ...settle })
  const [name, setName] = React.useState(space.name)
  const writable = calendars.filter((calendar) => calendar.writable && calendar.enabled)

  return (
    <Row muted={space.archived}>
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
    </Row>
  )
}

function Spaces() {
  const { t } = ReactI18next.useTranslation("Settings")
  const settle = useSettle()
  const spaces = ReactQuery.useQuery(Queries.workSpacesOptions())
  const calendars = ReactQuery.useQuery(Queries.calendarCalendarsOptions())
  const add = ReactQuery.useMutation({ ...Queries.workAddSpaceMutation(), ...settle })
  const [name, setName] = React.useState("")
  const [color, setColor] = React.useState("#4f6bed")

  return (
    <Section title={t("spaces.title")} description={t("spaces.description")}>
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
    </Section>
  )
}

function Calendars() {
  const { t } = ReactI18next.useTranslation("Settings")
  const settle = useSettle()
  const calendars = ReactQuery.useQuery(Queries.calendarCalendarsOptions({ query: { includeDisabled: "true" } }))
  const change = ReactQuery.useMutation({ ...Queries.calendarChangeCalendarMutation(), ...settle })

  return (
    <Section title={t("calendars.title")} description={t("calendars.description")}>
      {calendars.isPending && <Skeleton.Skeleton className="h-24" />}
      {(calendars.data ?? []).map((calendar) => (
        <Row key={calendar.id} muted={!calendar.enabled}>
          <span
            className="size-3 shrink-0 rounded-full"
            style={{ backgroundColor: calendar.color }}
            aria-hidden="true"
          />
          <span className="font-medium">{calendar.name}</span>
          <Badge.Badge variant={calendar.writable ? "secondary" : "outline"}>
            {t(calendar.writable ? "calendars.writable" : "calendars.readonly")}
          </Badge.Badge>
          <label className="ms-auto flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={calendar.enabled}
              onChange={(event) =>
                change.mutate({ path: { id: String(calendar.id) }, body: { enabled: event.target.checked } })
              }
            />
            {t("calendars.shown")}
          </label>
        </Row>
      ))}
    </Section>
  )
}

function Connections() {
  const { t } = ReactI18next.useTranslation("Settings")
  const graph = ReactQuery.useQuery(Queries.globalGraphOptions())
  const connect = ReactQuery.useMutation({
    ...Queries.globalConnectGraphMutation(),
    onSuccess: (result) => window.location.assign(result.url),
    onError: (error) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  })

  return (
    <Section title={t("connections.title")} description={t("connections.description")}>
      <Row>
        <LucideReact.MailIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="font-medium">Outlook</span>
        {graph.data == null ? (
          <span className="text-sm text-muted-foreground">{t("connections.none")}</span>
        ) : (
          <span className="text-sm text-muted-foreground">
            {t("connections.connected", { account: graph.data.account, at: graph.data.connected.replace("T", " ") })}
          </span>
        )}
        <Button.Button
          size="sm"
          variant="outline"
          className="ms-auto"
          disabled={connect.isPending}
          onClick={() => connect.mutate({})}
        >
          {t(graph.data == null ? "connections.connect" : "connections.reconnect")}
        </Button.Button>
      </Row>
    </Section>
  )
}

function Agents() {
  const { t } = ReactI18next.useTranslation("Settings")
  const settle = useSettle()
  const agents = ReactQuery.useQuery(Queries.globalAgentsOptions())
  const add = ReactQuery.useMutation({ ...Queries.globalAddAgentMutation(), ...settle })
  const archive = ReactQuery.useMutation({ ...Queries.globalArchiveAgentMutation(), ...settle })
  const [slug, setSlug] = React.useState("")
  const [name, setName] = React.useState("")

  return (
    <Section title={t("agents.title")} description={t("agents.description")}>
      {(agents.data ?? []).length === 0 && !agents.isPending && (
        <p className="text-sm text-muted-foreground">{t("agents.none")}</p>
      )}
      {(agents.data ?? []).map((agent) => (
        <Row key={agent.slug} muted={agent.archived}>
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
        </Row>
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
    </Section>
  )
}

function Clients() {
  const { t } = ReactI18next.useTranslation("Settings")
  const settle = useSettle()
  const clients = ReactQuery.useQuery(Queries.globalClientsOptions())
  const confirmDialog = ConfirmDialog.useConfirmDialog()
  const revoke = ReactQuery.useMutation({
    ...Queries.globalRevokeClientMutation(),
    ...settle
  })

  return (
    <Section title={t("clients.title")} description={t("clients.description")}>
      {(clients.data ?? []).length === 0 && !clients.isPending && (
        <p className="text-sm text-muted-foreground">{t("clients.none")}</p>
      )}
      {(clients.data ?? []).map((client) => (
        <Row key={client.id}>
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
        </Row>
      ))}
    </Section>
  )
}

export function SettingsPage() {
  const { t } = ReactI18next.useTranslation("Settings")
  return (
    <div className="grid max-w-4xl gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <Spaces />
      <Calendars />
      <Connections />
      <Agents />
      <Clients />
    </div>
  )
}
