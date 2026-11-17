import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"

import * as IconButton from "@/components/icon-button"
import * as Button from "@/components/ui/button"
import * as Dialog from "@/components/ui/dialog"
import * as Select from "@/components/ui/select"
import * as Separator from "@/components/ui/separator"
import * as Skeleton from "@/components/ui/skeleton"
import * as Textarea from "@/components/ui/textarea"
import * as Completion from "@/features/tasks/completion"
import * as TaskBits from "@/features/tasks/task-bits"
import * as TaskEdit from "@/features/tasks/task-edit"
import * as Work from "@/features/tasks/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import * as Prague from "@/lib/prague"
import * as Utils from "@/lib/utils"
import * as CopyLink from "@/components/copy-link"
import * as TaskUrl from "@/features/tasks/url"
import * as WorkActions from "@/features/tasks/work-actions"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  )
}

function Details({ id, comment: pointed, onClose }: { id: string; comment: string | null; onClose: () => void }) {
  const { t } = ReactI18next.useTranslation("Work")
  const client = ReactQuery.useQueryClient()
  const assignee = TaskBits.useAssignee()
  const task = ReactQuery.useQuery(Queries.workTaskOptions({ path: { id } }))
  const agents = ReactQuery.useQuery(Queries.globalAgentsOptions())
  const note = React.useRef<HTMLTextAreaElement>(null)
  const askForNote = React.useRef(false)
  const [text, setText] = React.useState("")
  const [editing, setEditing] = React.useState(false)
  const settle = {
    onSuccess: () => {
      setText("")
      return client.invalidateQueries()
    },
    onError: (error: unknown) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  }
  const comment = ReactQuery.useMutation({ ...Queries.workCommentMutation(), ...settle })
  const change = ReactQuery.useMutation({ ...Queries.workChangeTaskMutation(), ...settle })

  const loaded = task.data !== undefined
  React.useEffect(() => {
    if (loaded && pointed !== null) document.getElementById(`comment-${pointed}`)?.scrollIntoView({ block: "center" })
  }, [loaded, pointed])

  if (task.isPending)
    return (
      <>
        <Dialog.DialogHeader>
          <Dialog.DialogTitle>
            <Skeleton.Skeleton className="h-5 w-48" />
          </Dialog.DialogTitle>
        </Dialog.DialogHeader>
        <Skeleton.Skeleton className="mx-4 h-40" />
      </>
    )
  if (task.data === undefined)
    return (
      <Dialog.DialogHeader>
        <Dialog.DialogTitle>{t("notFound")}</Dialog.DialogTitle>
      </Dialog.DialogHeader>
    )
  const found = task.data

  /** A move into blocked or review takes the comment box as its note: what is needed, or what to check. */
  const move = (status: Work.Status) => {
    if (!Work.explained.includes(status)) return change.mutate({ path: { id }, body: { status } })
    if (text.trim() === "") {
      Sonner.toast.info(t(status === "blocked" ? "board.whatIsNeeded" : "board.whatToCheck"))
      askForNote.current = true
      return
    }
    change.mutate({ path: { id }, body: { status, comment: text.trim() } })
  }

  return (
    <>
      <Dialog.DialogHeader className="flex-row items-start gap-1">
        <span className="flex pt-1.5 pe-1.5">
          <Completion.DoneCheckbox task={found} />
        </span>
        <Dialog.DialogTitle className="min-w-0 flex-1 pt-1">{found.title}</Dialog.DialogTitle>
        <IconButton.IconButton
          label={t("edit.button")}
          className="-my-1 size-8 shrink-0"
          disabled={editing}
          onClick={() => setEditing(true)}
        >
          <LucideReact.PencilIcon />
        </IconButton.IconButton>
        <CopyLink.CopyLink url={TaskUrl.taskUrl(id)} className="-my-1 size-8 shrink-0" />
        <TaskEdit.DeleteButton task={found} onDeleted={onClose} />
      </Dialog.DialogHeader>
      <Dialog.DialogBody className="grid gap-5 pb-1">
        <WorkActions.WorkButtons task={found} />
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border bg-muted/30 p-3">
          <Field label={t("fields.status")}>
            <Select.Select value={found.status} onValueChange={(value) => move(value as Work.Status)}>
              <Select.SelectTrigger size="sm" aria-label={t("fields.status")} className="h-7 w-full bg-background">
                <Select.SelectValue />
              </Select.SelectTrigger>
              <Select.SelectContent
                onCloseAutoFocus={(event) => {
                  if (!askForNote.current) return
                  askForNote.current = false
                  event.preventDefault()
                  note.current?.focus()
                }}
              >
                {Work.statuses.map((status) => (
                  <Select.SelectItem key={status} value={status}>
                    {t(`status.${status}`)}
                  </Select.SelectItem>
                ))}
              </Select.SelectContent>
            </Select.Select>
          </Field>
          <Field label={t("fields.assignee")}>
            <Select.Select
              value={found.assignee}
              onValueChange={(value) => change.mutate({ path: { id }, body: { assignee: value } })}
            >
              <Select.SelectTrigger size="sm" aria-label={t("fields.assignee")} className="h-7 w-full bg-background">
                <Select.SelectValue />
              </Select.SelectTrigger>
              <Select.SelectContent>
                {[
                  ...new Set([
                    "owner",
                    ...(agents.data ?? []).filter((agent) => !agent.archived).map((agent) => agent.slug),
                    found.assignee
                  ])
                ].map((person) => (
                  <Select.SelectItem key={person} value={person}>
                    <TaskBits.Assignee assignee={person} />
                  </Select.SelectItem>
                ))}
              </Select.SelectContent>
            </Select.Select>
          </Field>
          <Field label={t("fields.project")}>
            <TaskEdit.ProjectSelect task={found} />
          </Field>
          <Field label={t("fields.priority")}>
            <TaskEdit.PrioritySelect task={found} />
          </Field>
          <Field label={t("fields.deadline")}>
            <TaskEdit.DeadlineInput task={found} />
          </Field>
          <Field label={t("fields.estimate")}>
            <TaskEdit.EstimateInput task={found} />
          </Field>
          <Field label={t("fields.spent")}>{Prague.duration(found.spent)}</Field>
        </div>
        <section className="grid gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("brief")}</h3>
          {editing ? (
            <TaskEdit.BriefForm task={found} onDone={() => setEditing(false)} />
          ) : (
            <p
              className={
                found.body.length > 0 ? "text-sm leading-relaxed whitespace-pre-wrap" : "text-sm text-muted-foreground"
              }
            >
              {found.body.length > 0 ? found.body : t("noBody")}
            </p>
          )}
        </section>
        <section className="grid gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("links.title")}</h3>
          <TaskEdit.Links task={found} />
        </section>
        <Separator.Separator />
        <section className="grid gap-3">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("comments", { count: found.comments.length })}
          </h3>
          {found.comments.length > 0 && (
            <ol className="grid gap-3 border-s ps-4">
              {found.comments.map((one) => (
                <li
                  key={one.id}
                  id={`comment-${one.id}`}
                  className={Utils.cn(
                    "group relative -ms-2 grid scroll-m-4 gap-1 rounded-md px-2 py-1",
                    one.id === pointed && "bg-primary-soft"
                  )}
                >
                  <span
                    className="absolute top-2.5 -start-[0.8rem] size-2 rounded-full bg-border ring-4 ring-background"
                    aria-hidden="true"
                  />
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{assignee(one.author)}</span>·
                    <span>{one.at.replace("T", " ")}</span>
                    <CopyLink.CopyLink
                      url={TaskUrl.taskUrl(id, one.id)}
                      className="ms-auto size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [&_svg]:size-3.5"
                    />
                  </span>
                  <p className="text-sm whitespace-pre-wrap">{one.text}</p>
                </li>
              ))}
            </ol>
          )}
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (text.trim().length > 0) comment.mutate({ path: { id }, body: { text: text.trim() } })
            }}
          >
            <Textarea.Textarea
              ref={note}
              aria-label={t("comment")}
              placeholder={t("comment")}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <Button.Button
              className="justify-self-end"
              type="submit"
              variant="outline"
              disabled={comment.isPending || text.trim().length === 0}
            >
              {t("addComment")}
            </Button.Button>
          </form>
        </section>
      </Dialog.DialogBody>
    </>
  )
}

/** The task the address names, over whichever page is open, where its fields, brief and links are edited and it is commented on. */
export function TaskDialog() {
  const [{ task, comment }, set] = TaskUrl.useTaskParams()
  return (
    <Dialog.Dialog open={task !== null} onOpenChange={(open) => !open && void set({ task: null, comment: null })}>
      <Dialog.DialogContent className="sm:max-w-xl" aria-describedby={undefined}>
        {task !== null && (
          <Details key={task} id={task} comment={comment} onClose={() => void set({ task: null, comment: null })} />
        )}
      </Dialog.DialogContent>
    </Dialog.Dialog>
  )
}
