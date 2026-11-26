import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"

import * as Button from "@/components/ui/button"
import * as Dialog from "@/components/ui/dialog"
import * as Input from "@/components/ui/input"
import * as Label from "@/components/ui/label"
import * as Select from "@/components/ui/select"
import * as Textarea from "@/components/ui/textarea"
import * as Pointer from "@/features/calendar/lib/pointer"
import * as Repeat from "@/features/calendar/lib/repeat"
import * as RepeatFields from "@/features/calendar/components/repeat-fields"
import * as Work from "@/features/tasks/lib/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import type * as Api from "@/lib/api/generated/types.gen"
import * as Prague from "@/lib/prague"
import * as UseEventDialog from "@/features/calendar/hooks/use-event-dialog"

const showAs = ["busy", "tentative", "free", "oof", "workingElsewhere"] as const

interface Form {
  readonly title: string
  readonly calendar: string
  readonly day: string
  readonly start: string
  readonly end: string
  readonly firstDay: string
  readonly lastDay: string
  readonly location: string
  readonly notes: string
  readonly showAs: Api.EventEncoded["showAs"]
}

const formOf = (state: UseEventDialog.DialogState, calendars: ReadonlyArray<Api.CalendarEncoded>): Form => {
  if (state.kind === "create") {
    const span = Pointer.span(state.placement)
    return {
      title: "",
      calendar: String(calendars[0]?.id ?? ""),
      day: state.placement.day,
      start: span.start.slice(11),
      end: span.end.slice(11),
      firstDay: state.placement.day,
      lastDay: state.placement.day,
      location: "",
      notes: "",
      showAs: "busy"
    }
  }
  const { event } = state
  return {
    title: event.title,
    calendar: String(event.calendar),
    day: event.start.slice(0, 10),
    start: event.start.slice(11),
    end: event.end.slice(11),
    firstDay: event.start.slice(0, 10),
    lastDay: Prague.addDays(event.end.slice(0, 10), -1),
    location: event.location ?? "",
    notes: event.notes ?? "",
    showAs: event.showAs
  }
}

/** The end of a timed event on its day; an end at or before its start runs to the next midnight. */
const endOf = (form: Form) =>
  form.end > form.start ? `${form.day}T${form.end}` : `${Prague.addDays(form.day, 1)}T00:00`

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Label.Label className="grid gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </Label.Label>
  )
}

function Fields({
  form,
  set,
  allDay,
  calendars
}: {
  form: Form
  set: (change: Partial<Form>) => void
  allDay: boolean
  calendars: ReadonlyArray<Api.CalendarEncoded> | null
}) {
  const { t } = ReactI18next.useTranslation("Calendar")
  return (
    <div className="grid gap-3">
      <Field label={t("event.title")}>
        <Input.Input required value={form.title} onChange={(event) => set({ title: event.target.value })} />
      </Field>
      {calendars !== null && calendars.length > 1 && (
        <Field label={t("event.calendar")}>
          <Select.Select value={form.calendar} onValueChange={(calendar) => set({ calendar })}>
            <Select.SelectTrigger className="w-full">
              <Select.SelectValue />
            </Select.SelectTrigger>
            <Select.SelectContent>
              {calendars.map((calendar) => (
                <Select.SelectItem key={calendar.id} value={String(calendar.id)}>
                  {calendar.name}
                </Select.SelectItem>
              ))}
            </Select.SelectContent>
          </Select.Select>
        </Field>
      )}
      {allDay ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("event.firstDay")}>
            <Input.Input
              type="date"
              required
              value={form.firstDay}
              onChange={(event) => set({ firstDay: event.target.value })}
            />
          </Field>
          <Field label={t("event.lastDay")}>
            <Input.Input
              type="date"
              required
              value={form.lastDay}
              onChange={(event) => set({ lastDay: event.target.value })}
            />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-3">
          <Field label={t("event.day")}>
            <Input.Input type="date" required value={form.day} onChange={(event) => set({ day: event.target.value })} />
          </Field>
          <Field label={t("event.start")}>
            <Input.Input
              type="time"
              step={300}
              required
              value={form.start}
              onChange={(event) => set({ start: event.target.value })}
            />
          </Field>
          <Field label={t("event.end")}>
            <Input.Input
              type="time"
              step={300}
              required
              value={form.end}
              onChange={(event) => set({ end: event.target.value })}
            />
          </Field>
        </div>
      )}
      <Field label={t("event.location")}>
        <Input.Input value={form.location} onChange={(event) => set({ location: event.target.value })} />
      </Field>
      <Field label={t("event.showAs")}>
        <Select.Select value={form.showAs} onValueChange={(value) => set({ showAs: value as Form["showAs"] })}>
          <Select.SelectTrigger>
            <Select.SelectValue />
          </Select.SelectTrigger>
          <Select.SelectContent>
            {showAs.map((value) => (
              <Select.SelectItem key={value} value={value}>
                {t(`showAs.${value}`)}
              </Select.SelectItem>
            ))}
          </Select.SelectContent>
        </Select.Select>
      </Field>
      <Field label={t("event.notes")}>
        <Textarea.Textarea value={form.notes} onChange={(event) => set({ notes: event.target.value })} />
      </Field>
    </div>
  )
}

function Body({
  state,
  calendars,
  onClose
}: {
  state: UseEventDialog.DialogState
  calendars: ReadonlyArray<Api.CalendarEncoded>
  onClose: () => void
}) {
  const { t } = ReactI18next.useTranslation("Calendar")
  const client = ReactQuery.useQueryClient()
  const writable = calendars.filter((calendar) => calendar.writable && calendar.enabled)
  const [form, setForm] = React.useState(() => formOf(state, writable))
  const set = (change: Partial<Form>) => setForm((current) => ({ ...current, ...change }))
  const repeats = state.kind === "create" && !state.draft
  const [repeat, setRepeat] = React.useState(() => Repeat.initial(form.day))
  const settle = {
    onSuccess: () => {
      onClose()
      return client.invalidateQueries()
    },
    onError: (error: unknown) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  }
  const create = ReactQuery.useMutation({ ...Queries.calendarCreateEventMutation(), ...settle })
  const change = ReactQuery.useMutation({ ...Queries.calendarChangeEventMutation(), ...settle })
  const busy = create.isPending || change.isPending
  const allDay = state.kind === "edit" && state.event.allDay

  const submit = (submitted: React.FormEvent) => {
    submitted.preventDefault()
    const details = {
      title: form.title,
      location: form.location,
      notes: form.notes,
      showAs: form.showAs,
      ...(allDay
        ? { firstDay: form.firstDay, lastDay: form.lastDay }
        : { start: `${form.day}T${form.start}`, end: endOf(form) })
    }
    const repeated = repeats ? Repeat.repeatOf(repeat) : undefined
    if (state.kind === "create")
      create.mutate({
        body: {
          ...details,
          calendar: Number(form.calendar),
          draft: state.draft,
          ...(repeated !== undefined && { repeat: repeated })
        }
      })
    else change.mutate({ path: { id: state.event.id }, body: details })
  }

  return (
    <form className="contents" onSubmit={submit}>
      <Dialog.DialogHeader>
        <Dialog.DialogTitle>
          {state.kind === "create"
            ? t(state.draft ? "event.newDraft" : "event.new")
            : state.event.title || t("untitled")}
        </Dialog.DialogTitle>
        <Dialog.DialogDescription>
          {state.kind === "create"
            ? t("event.newHint")
            : calendars.find((calendar) => calendar.id === state.event.calendar)?.name}
        </Dialog.DialogDescription>
      </Dialog.DialogHeader>
      <Dialog.DialogBody className="grid gap-3">
        <Fields form={form} set={set} allDay={allDay} calendars={state.kind === "create" ? writable : null} />
        {repeats && (
          <RepeatFields.RepeatFields
            day={form.day}
            form={repeat}
            set={(edit) => setRepeat((current) => ({ ...current, ...edit }))}
          />
        )}
      </Dialog.DialogBody>
      <Dialog.DialogFooter>
        <Button.Button type="button" variant="outline" onClick={onClose}>
          {t("event.close")}
        </Button.Button>
        <Button.Button
          type="submit"
          disabled={busy || form.title.trim() === "" || (state.kind === "create" && writable.length === 0)}
        >
          {t(state.kind === "create" ? "event.create" : "event.save")}
        </Button.Button>
      </Dialog.DialogFooter>
    </form>
  )
}

/** The form that creates an event or changes one ras may write. */
export function EventDialog({
  open,
  onOpenChange,
  state
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  state: UseEventDialog.DialogState
}) {
  const calendars = ReactQuery.useQuery(Queries.calendarCalendarsOptions())
  return (
    <Dialog.Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.DialogContent className="sm:max-w-lg">
        <Body state={state} calendars={calendars.data ?? []} onClose={() => onOpenChange(false)} />
      </Dialog.DialogContent>
    </Dialog.Dialog>
  )
}
