import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"

import * as Button from "@/components/ui/button"
import * as Dialog from "@/components/ui/dialog"
import * as Select from "@/components/ui/select"
import * as Separator from "@/components/ui/separator"
import * as Skeleton from "@/components/ui/skeleton"
import * as Textarea from "@/components/ui/textarea"
import * as TaskBits from "@/features/tasks/task-bits"
import * as Work from "@/features/tasks/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import * as Prague from "@/lib/prague"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  )
}

function Details({ id }: { id: string }) {
  const { t } = ReactI18next.useTranslation("Work")
  const client = ReactQuery.useQueryClient()
  const assignee = TaskBits.useAssignee()
  const task = ReactQuery.useQuery(Queries.workTaskOptions({ path: { id } }))
  const agents = ReactQuery.useQuery(Queries.globalAgentsOptions())
  const note = React.useRef<HTMLTextAreaElement>(null)
  const askForNote = React.useRef(false)
  const [text, setText] = React.useState("")
  const settle = {
    onSuccess: () => {
      setText("")
      return client.invalidateQueries()
    },
    onError: (error: unknown) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  }
  const comment = ReactQuery.useMutation({ ...Queries.workCommentMutation(), ...settle })
  const change = ReactQuery.useMutation({ ...Queries.workChangeTaskMutation(), ...settle })

  if (task.isPending) return <Skeleton.Skeleton className="mx-4 h-40" />
  if (task.data === undefined) return <p className="px-4 text-sm text-muted-foreground">{t("notFound")}</p>
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
    <Dialog.DialogBody className="grid gap-5 pb-1">
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
        <Field label={t("fields.priority")}>
          {found.priority === "urgent" || found.priority === "high" ? (
            <TaskBits.PriorityFlag priority={found.priority} withLabel />
          ) : (
            t(`priority.${found.priority}`)
          )}
        </Field>
        <Field label={t("fields.deadline")}>
          <TaskBits.Due task={found} />
        </Field>
        <Field label={t("fields.spent")}>{Prague.duration(found.spent)}</Field>
        <Field label={t("fields.estimate")}>{found.estimate === null ? "—" : Prague.duration(found.estimate)}</Field>
      </div>
      <section className="grid gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("brief")}</h3>
        <p
          className={
            found.body.length > 0 ? "text-sm leading-relaxed whitespace-pre-wrap" : "text-sm text-muted-foreground"
          }
        >
          {found.body.length > 0 ? found.body : t("noBody")}
        </p>
        {found.links.length > 0 && (
          <ul className="grid gap-1 text-sm">
            {found.links.map((link) => (
              <li key={link} className="flex min-w-0 items-center gap-1.5">
                <LucideReact.LinkIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <a
                  className="truncate text-primary underline-offset-2 hover:underline"
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                >
                  {link}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Separator.Separator />
      <section className="grid gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t("comments", { count: found.comments.length })}
        </h3>
        {found.comments.length > 0 && (
          <ol className="grid gap-3 border-s ps-4">
            {found.comments.map((one) => (
              <li key={one.id} className="relative grid gap-1">
                <span
                  className="absolute top-1.5 -start-[1.3rem] size-2 rounded-full bg-border ring-4 ring-background"
                  aria-hidden="true"
                />
                <span className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{assignee(one.author)}</span> ·{" "}
                  {one.at.replace("T", " ")}
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
  )
}

/** A task with its body, comments and links, opened over the page it came from. */
export function TaskDialog({ id, title, onClose }: { id: string | null; title: string; onClose: () => void }) {
  return (
    <Dialog.Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.DialogContent className="sm:max-w-xl" aria-describedby={undefined}>
        <Dialog.DialogHeader>
          <Dialog.DialogTitle>{title}</Dialog.DialogTitle>
        </Dialog.DialogHeader>
        {id !== null && <Details id={id} />}
      </Dialog.DialogContent>
    </Dialog.Dialog>
  )
}
