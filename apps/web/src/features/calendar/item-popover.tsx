import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"

import * as IconButton from "@/components/icon-button"
import * as Button from "@/components/ui/button"
import * as Popover from "@/components/ui/popover"
import * as BlockMoveDialog from "@/features/calendar/block-move-dialog"
import * as DraftControls from "@/features/calendar/draft-controls"
import * as Skeleton from "@/components/ui/skeleton"
import type * as Grid from "@/features/calendar/grid"
import * as Pointer from "@/features/calendar/pointer"
import * as Url from "@/features/calendar/url"
import * as Completion from "@/features/tasks/completion"
import * as TaskBits from "@/features/tasks/task-bits"
import * as WorkActions from "@/features/tasks/work-actions"
import * as WorkLog from "@/features/tasks/work-log"
import * as Work from "@/features/tasks/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import type * as Api from "@/lib/api/generated/types.gen"
import * as Prague from "@/lib/prague"
import * as CopyLink from "@/components/copy-link"

const replies = ["accept", "tentative", "decline"] as const

const line = (icon: React.ReactNode, children: React.ReactNode) => (
  <div className="flex items-start gap-2.5">
    <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">{icon}</span>
    <div className="min-w-0 flex-1 wrap-anywhere">{children}</div>
  </div>
)

function useWhen() {
  const { i18n } = ReactI18next.useTranslation()
  const day = (local: string) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
      new Date(`${local.slice(0, 10)}T12:00:00Z`)
    )
  return {
    day,
    span: (start: string, end: string) => `${day(start)}, ${start.slice(11)}–${end.slice(11)}`,
    /** All-day days: the end is the midnight after the last one, and a single day is named once. */
    days: (start: string, end: string) => {
      const last = Prague.addDays(end.slice(0, 10), -1)
      return last === start.slice(0, 10) ? day(start) : `${day(start)} – ${day(last)}`
    }
  }
}

function Heading({ color, title, detail }: { color: string; title: string; detail: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 pe-14">
      <span className="mt-1 h-3.5 w-1 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
      <div className="grid min-w-0 gap-0.5">
        <h2 className="font-heading leading-snug font-medium wrap-anywhere">{title}</h2>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

function EventCard({
  event,
  calendars,
  color,
  onEdit,
  onDone
}: {
  event: Api.EventEncoded
  calendars: ReadonlyArray<Api.CalendarEncoded>
  color: string
  onEdit: () => void
  onDone: () => void
}) {
  const { t } = ReactI18next.useTranslation("Calendar")
  const client = ReactQuery.useQueryClient()
  const when = useWhen()
  const settle = {
    onSuccess: () => {
      onDone()
      return client.invalidateQueries()
    },
    onError: (error: unknown) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  }
  const cancel = ReactQuery.useMutation({ ...Queries.calendarCancelEventMutation(), ...settle })
  const confirm = ReactQuery.useMutation({ ...Queries.calendarConfirmDraftMutation(), ...settle })
  const reply = ReactQuery.useMutation({ ...Queries.calendarReplyToEventMutation(), ...settle })
  const busy = cancel.isPending || confirm.isPending || reply.isPending
  const editable = Pointer.editable(event, calendars)
  const calendar = calendars.find((each) => each.id === event.calendar)?.name ?? ""

  return (
    <>
      <Heading
        color={color}
        title={event.title || t("untitled")}
        detail={
          <>
            {event.draft !== null && <span className="font-medium text-foreground">{t("draft.badge")} · </span>}
            {calendar}
          </>
        }
      />
      {event.draft?.refusal != null && (
        <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{event.draft.refusal}</p>
      )}
      <div className="grid gap-2">
        {line(
          <LucideReact.ClockIcon />,
          <span className="first-letter:uppercase">
            {event.allDay ? when.days(event.start, event.end) : when.span(event.start, event.end)}
          </span>
        )}
        {event.location !== null && line(<LucideReact.MapPinIcon />, event.location)}
        {event.attendees.length > 0 &&
          line(
            <LucideReact.UsersIcon />,
            <ul className="grid max-h-32 gap-1 overflow-y-auto">
              {event.attendees.map((attendee) => (
                <li key={attendee.email ?? attendee.name} className="flex items-center gap-2">
                  <span className="truncate">{attendee.name ?? attendee.email}</span>
                  {attendee.organizer && <span className="text-xs text-muted-foreground">{t("event.organizer")}</span>}
                  <span className="ms-auto shrink-0 text-xs text-muted-foreground">{t(`rsvp.${attendee.rsvp}`)}</span>
                </li>
              ))}
            </ul>
          )}
        {event.notes !== null &&
          line(<LucideReact.TextIcon />, <p className="line-clamp-6 whitespace-pre-wrap">{event.notes}</p>)}
        {!editable && event.kind !== "invitation" && (
          <p className="text-xs text-muted-foreground">{t("event.readonly", { calendar })}</p>
        )}
      </div>
      {event.kind === "invitation" && (
        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">
            {t("event.yourReply", { reply: t(`rsvp.${event.rsvp}`) })}
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {replies.map((answer) => (
              <Button.Button
                key={answer}
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => reply.mutate({ path: { id: event.id }, body: { reply: answer } })}
              >
                {t(`reply.${answer}`)}
              </Button.Button>
            ))}
          </div>
        </div>
      )}
      {editable && (
        <div className="flex items-center gap-1.5 border-t pt-2.5">
          <IconButton.IconButton
            label={t(event.draft === null ? "event.cancel" : "event.discard")}
            className="me-auto text-destructive"
            disabled={busy}
            onClick={() => cancel.mutate({ path: { id: event.id } })}
          >
            <LucideReact.Trash2Icon />
          </IconButton.IconButton>
          {event.draft !== null && (
            <Button.Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => confirm.mutate({ path: { id: event.id } })}
            >
              {t("event.confirm")}
            </Button.Button>
          )}
          <Button.Button size="sm" disabled={busy} onClick={onEdit}>
            <LucideReact.PencilIcon />
            {t("item.edit")}
          </Button.Button>
        </div>
      )}
    </>
  )
}

function BlockCard({
  block,
  color,
  onOpenTask,
  onDone
}: {
  block: Api.BlockEncoded
  color: string
  onOpenTask: () => void
  onDone: () => void
}) {
  const { t } = ReactI18next.useTranslation("Calendar")
  const work = ReactI18next.useTranslation("Work").t
  const when = useWhen()
  const task = ReactQuery.useQuery(Queries.workTaskOptions({ path: { id: block.task } }))
  const moveDialog = BlockMoveDialog.useBlockMoveDialog()
  const clock = WorkActions.useClock()
  const remove = WorkLog.useRemoveBlock()
  const confirm = DraftControls.useConfirmDrafts(onDone)
  const running = block.state === "running"

  return (
    <>
      <Heading color={color} title={block.title} detail={t(`item.state.${block.state}`)} />
      <div className="grid gap-2">
        {line(
          <LucideReact.ClockIcon />,
          <span className="first-letter:uppercase">
            {block.end === null
              ? `${when.day(block.start)}, ${block.start.slice(11)}–`
              : when.span(block.start, block.end)}
          </span>
        )}
        {task.isPending ? (
          <Skeleton.Skeleton className="h-5" />
        ) : (
          task.data !== undefined &&
          line(
            <LucideReact.SquareCheckIcon />,
            <span className="flex flex-wrap items-center gap-2">
              <Completion.DoneCheckbox task={task.data} />
              <TaskBits.StatusBadge status={task.data.status} />
              <span className="text-xs text-muted-foreground tabular-nums">
                {work("fields.spent")} {Prague.duration(task.data.spent)}
                {task.data.estimate !== null && ` / ${Prague.duration(task.data.estimate)}`}
              </span>
            </span>
          )
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t pt-2.5">
        {!running && (
          <>
            <IconButton.IconButton
              label={t("item.removeBlock")}
              className="me-auto text-destructive"
              onClick={() => {
                remove(block)
                onDone()
              }}
            >
              <LucideReact.Trash2Icon />
            </IconButton.IconButton>
            <Button.Button
              size="sm"
              variant="outline"
              onClick={() => {
                moveDialog.open({ block })
                onDone()
              }}
            >
              <LucideReact.CalendarClockIcon />
              {t("item.moveBlock")}
            </Button.Button>
          </>
        )}
        {block.state === "draft" && (
          <Button.Button
            size="sm"
            variant="outline"
            disabled={confirm.isPending}
            onClick={() =>
              confirm.mutate({
                body: { drafts: [block.id] as unknown as NonNullable<Api.WorkConfirmDraftsData["body"]["drafts"]> }
              })
            }
          >
            <LucideReact.CheckIcon />
            {t("event.confirm")}
          </Button.Button>
        )}
        {running ? (
          <Button.Button size="sm" variant="outline" disabled={clock.busy} onClick={clock.stop}>
            <LucideReact.SquareIcon />
            {work("work.stop")}
          </Button.Button>
        ) : (
          task.data !== undefined &&
          task.data.status !== "done" && (
            <Button.Button size="sm" variant="outline" disabled={clock.busy} onClick={() => clock.start(block.task)}>
              <LucideReact.PlayIcon />
              {work("work.start")}
            </Button.Button>
          )
        )}
        <Button.Button size="sm" className="ms-auto" onClick={onOpenTask}>
          {t("item.openTask")}
        </Button.Button>
      </div>
    </>
  )
}

/**
 * Where the item's first tile is, brought into view; a wide tile counts as its start, so the popover sits beside it
 * rather than past the window's edge. The top middle of the window stands in when the view hides the item.
 */
const placeOf = (id: string) => {
  const tile = document.querySelector(`[data-item="${CSS.escape(id)}"]`)
  if (tile === null) return new DOMRect(window.innerWidth / 2, 120, 0, 0)
  tile.scrollIntoView({ block: "center" })
  const { left, top, width, height } = tile.getBoundingClientRect()
  return new DOMRect(left, top, Math.min(width, 240), height)
}

/** What an event or a block in the grid is, beside it, with the actions that need no form. */
export function ItemPopover({
  item,
  calendars,
  colorOf,
  onClose,
  onEdit,
  onOpenTask
}: {
  item: Grid.Item | null
  calendars: ReadonlyArray<Api.CalendarEncoded>
  colorOf: (calendar: number) => string
  onClose: () => void
  onEdit: (event: Api.EventEncoded) => void
  onOpenTask: (block: Api.BlockEncoded) => void
}) {
  const { t } = ReactI18next.useTranslation("Calendar")
  const id = item === null ? null : item.kind === "event" ? item.event.id : item.block.id
  const [at, setAt] = React.useState<DOMRect | null>(null)
  React.useEffect(() => {
    if (id === null) return setAt(null)
    const timer = setTimeout(() => setAt(placeOf(id)))
    return () => clearTimeout(timer)
  }, [id])

  return (
    <Popover.Popover open={item !== null && at !== null} onOpenChange={(open) => !open && onClose()}>
      <Popover.PopoverAnchor
        className="pointer-events-none fixed"
        style={at === null ? undefined : { left: at.left, top: at.top, width: at.width, height: at.height }}
      />
      <Popover.PopoverContent
        side="right"
        align="start"
        collisionPadding={12}
        className="w-80 gap-3 p-3"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="absolute top-2 right-2 flex">
          {item !== null && <CopyLink.CopyLink url={Url.itemUrl(item)} className="size-7" />}
          <IconButton.IconButton label={t("item.close")} className="size-7" onClick={onClose}>
            <LucideReact.XIcon />
          </IconButton.IconButton>
        </div>
        {item?.kind === "event" && (
          <EventCard
            key={item.event.id}
            event={item.event}
            calendars={calendars}
            color={colorOf(item.event.calendar)}
            onEdit={() => onEdit(item.event)}
            onDone={onClose}
          />
        )}
        {item?.kind === "block" && (
          <BlockCard
            key={item.block.id}
            block={item.block}
            color={colorOf(item.block.calendar)}
            onOpenTask={() => onOpenTask(item.block)}
            onDone={onClose}
          />
        )}
      </Popover.PopoverContent>
    </Popover.Popover>
  )
}
