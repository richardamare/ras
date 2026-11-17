import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"

import * as Button from "@/components/ui/button"
import * as Dialog from "@/components/ui/dialog"
import * as Input from "@/components/ui/input"
import * as Label from "@/components/ui/label"
import * as Select from "@/components/ui/select"
import * as Textarea from "@/components/ui/textarea"
import * as Pointer from "@/features/calendar/pointer"
import * as Work from "@/features/tasks/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import type * as Api from "@/lib/api/generated/types.gen"
import * as Prague from "@/lib/prague"

export type DialogState =
  | { readonly kind: "create"; readonly placement: Pointer.Placement; readonly draft: boolean }
  | { readonly kind: "event"; readonly event: Api.EventEncoded }

const showAs = ["busy", "tentative", "free", "oof", "workingElsewhere"] as const
const replies = ["accept", "tentative", "decline"] as const

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

const formOf = (state: DialogState, calendars: ReadonlyArray<Api.CalendarEncoded>): Form => {
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

const line = (icon: React.ReactNode, children: React.ReactNode) => (
  <div className="flex items-start gap-3 text-sm">
    <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">{icon}</span>
    <div className="min-w-0 flex-1">{children}</div>
  </div>
)

/** An event ras does not write, shown as what it is rather than as a form that cannot be sent. */
function Summary({ event }: { event: Api.EventEncoded }) {
  const { t, i18n } = ReactI18next.useTranslation("Calendar")
  const day = (local: string) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
      new Date(`${local.slice(0, 10)}T12:00:00Z`)
    )
  const when = event.allDay
    ? `${day(event.start)} – ${day(Prague.addDays(event.end.slice(0, 10), -1))}`
    : `${day(event.start)}, ${event.start.slice(11)}–${event.end.slice(11)}`
  return (
    <div className="grid gap-3">
      {line(<LucideReact.ClockIcon />, <span className="first-letter:uppercase">{when}</span>)}
      {event.location !== null && line(<LucideReact.MapPinIcon />, event.location)}
      {event.attendees.length > 0 &&
        line(
          <LucideReact.UsersIcon />,
          <ul className="grid gap-1">
            {event.attendees.map((attendee) => (
              <li key={attendee.email ?? attendee.name} className="flex items-center gap-2">
                <span className="truncate">{attendee.name ?? attendee.email}</span>
                {attendee.organizer && <span className="text-xs text-muted-foreground">{t("event.organizer")}</span>}
                <span className="ms-auto text-xs text-muted-foreground">{t(`rsvp.${attendee.rsvp}`)}</span>
              </li>
            ))}
          </ul>
        )}
      {event.notes !== null && line(<LucideReact.TextIcon />, <p className="whitespace-pre-wrap">{event.notes}</p>)}
      {event.kind === "invitation" &&
        line(<LucideReact.MailQuestionIcon />, <span>{t("event.yourReply", { reply: t(`rsvp.${event.rsvp}`) })}</span>)}
    </div>
  )
}

function Body({
  state,
  calendars,
  onClose
}: {
  state: DialogState
  calendars: ReadonlyArray<Api.CalendarEncoded>
  onClose: () => void
}) {
  const { t } = ReactI18next.useTranslation("Calendar")
  const client = ReactQuery.useQueryClient()
  const writable = calendars.filter((calendar) => calendar.writable && calendar.enabled)
  const [form, setForm] = React.useState(() => formOf(state, writable))
  const set = (change: Partial<Form>) => setForm((current) => ({ ...current, ...change }))
  const settle = {
    onSuccess: () => {
      onClose()
      return client.invalidateQueries()
    },
    onError: (error: unknown) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  }
  const create = ReactQuery.useMutation({ ...Queries.calendarCreateEventMutation(), ...settle })
  const change = ReactQuery.useMutation({ ...Queries.calendarChangeEventMutation(), ...settle })
  const cancel = ReactQuery.useMutation({ ...Queries.calendarCancelEventMutation(), ...settle })
  const confirm = ReactQuery.useMutation({ ...Queries.calendarConfirmDraftMutation(), ...settle })
  const reply = ReactQuery.useMutation({ ...Queries.calendarReplyToEventMutation(), ...settle })
  const busy = [create, change, cancel, confirm, reply].some((mutation) => mutation.isPending)

  const event = state.kind === "event" ? state.event : null
  const editable = event === null || Pointer.editable(event, calendars)
  const allDay = event?.allDay ?? false
  const calendarName = calendars.find((calendar) => calendar.id === event?.calendar)?.name

  const details = {
    title: form.title,
    location: form.location,
    notes: form.notes,
    showAs: form.showAs,
    ...(allDay
      ? { firstDay: form.firstDay, lastDay: form.lastDay }
      : { start: `${form.day}T${form.start}`, end: endOf(form) })
  }

  const submit = (submitted: React.FormEvent) => {
    submitted.preventDefault()
    if (event === null && state.kind === "create")
      create.mutate({ body: { ...details, calendar: Number(form.calendar), draft: state.draft } })
    else if (event !== null) change.mutate({ path: { id: event.id }, body: details })
  }

  return (
    <form className="contents" onSubmit={submit}>
      <Dialog.DialogHeader>
        <Dialog.DialogTitle>
          {event === null
            ? t(state.kind === "create" && state.draft ? "event.newDraft" : "event.new")
            : event.title || t("untitled")}
        </Dialog.DialogTitle>
        <Dialog.DialogDescription>
          {event === null
            ? t("event.newHint")
            : editable
              ? calendarName
              : t("event.readonly", { calendar: calendarName })}
        </Dialog.DialogDescription>
      </Dialog.DialogHeader>
      <Dialog.DialogBody className="grid gap-4">
        {event?.draft?.refusal != null && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{event.draft.refusal}</p>
        )}
        {event !== null && !editable ? (
          <Summary event={event} />
        ) : (
          <Fields form={form} set={set} allDay={allDay} calendars={event === null ? writable : null} />
        )}
      </Dialog.DialogBody>
      <Dialog.DialogFooter className="flex-wrap">
        {event?.kind === "invitation" &&
          replies.map((answer) => (
            <Button.Button
              key={answer}
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => reply.mutate({ path: { id: event.id }, body: { reply: answer } })}
            >
              {t(`reply.${answer}`)}
            </Button.Button>
          ))}
        {event !== null && editable && (
          <Button.Button
            type="button"
            variant="destructive"
            className="me-auto"
            disabled={busy}
            onClick={() => cancel.mutate({ path: { id: event.id } })}
          >
            {t(event.draft === null ? "event.cancel" : "event.discard")}
          </Button.Button>
        )}
        {event?.draft != null && (
          <Button.Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => confirm.mutate({ path: { id: event.id } })}
          >
            {t("event.confirm")}
          </Button.Button>
        )}
        {editable && (
          <Button.Button
            type="submit"
            disabled={busy || form.title.trim() === "" || (event === null && writable.length === 0)}
          >
            {t(event === null ? "event.create" : "event.save")}
          </Button.Button>
        )}
      </Dialog.DialogFooter>
    </form>
  )
}

export function EventDialog({
  state,
  calendars,
  onClose
}: {
  state: DialogState | null
  calendars: ReadonlyArray<Api.CalendarEncoded>
  onClose: () => void
}) {
  return (
    <Dialog.Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.DialogContent className="sm:max-w-lg">
        {state !== null && (
          <Body
            key={state.kind === "event" ? state.event.id : `${state.placement.day}-${state.placement.start}`}
            state={state}
            calendars={calendars}
            onClose={onClose}
          />
        )}
      </Dialog.DialogContent>
    </Dialog.Dialog>
  )
}
