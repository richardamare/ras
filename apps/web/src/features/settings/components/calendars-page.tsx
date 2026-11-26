import * as ReactQuery from "@tanstack/react-query"
import * as ReactI18next from "react-i18next"

import * as Badge from "@/components/ui/badge"
import * as Skeleton from "@/components/ui/skeleton"
import * as HiddenCalendars from "@/features/calendar/lib/hidden-calendars"
import * as SettingsSection from "@/features/settings/components/settings-section"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"

function Check({
  checked,
  disabled = false,
  onChange,
  label
}: {
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm has-disabled:cursor-default has-disabled:opacity-50">
      <input
        type="checkbox"
        className="size-4 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}

export function CalendarsPage() {
  const { t } = ReactI18next.useTranslation("Settings")
  const settle = SettingsSection.useSettle()
  const calendars = ReactQuery.useQuery(Queries.calendarCalendarsOptions({ query: { includeDisabled: "true" } }))
  const change = ReactQuery.useMutation({ ...Queries.calendarChangeCalendarMutation(), ...settle })
  const { hidden, toggle } = HiddenCalendars.useHiddenCalendars()

  return (
    <div className="grid max-w-4xl gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <SettingsSection.Section title={t("calendars.title")} description={t("calendars.description")}>
        {calendars.isPending && <Skeleton.Skeleton className="h-24" />}
        {calendars.data?.length === 0 && <p className="text-sm text-muted-foreground">{t("calendars.none")}</p>}
        {(calendars.data ?? []).map((calendar) => (
          <SettingsSection.Row key={calendar.id} muted={!calendar.enabled}>
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: calendar.color }}
              aria-hidden="true"
            />
            <span className="font-medium">{calendar.name}</span>
            <Badge.Badge variant={calendar.writable ? "secondary" : "outline"}>
              {t(calendar.writable ? "calendars.writable" : "calendars.readonly")}
            </Badge.Badge>
            <span className="ms-auto flex flex-wrap items-center gap-4">
              <Check
                label={t("calendars.onScreen")}
                checked={calendar.enabled && !hidden.has(calendar.id)}
                disabled={!calendar.enabled}
                onChange={() => toggle(calendar.id)}
              />
              <Check
                label={t("calendars.enabled")}
                checked={calendar.enabled}
                onChange={(enabled) => change.mutate({ path: { id: String(calendar.id) }, body: { enabled } })}
              />
            </span>
          </SettingsSection.Row>
        ))}
      </SettingsSection.Section>
    </div>
  )
}
