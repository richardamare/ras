import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"

import * as Button from "@/components/ui/button"
import * as Separator from "@/components/ui/separator"
import * as Sheet from "@/components/ui/sheet"
import * as Skeleton from "@/components/ui/skeleton"
import * as Textarea from "@/components/ui/textarea"
import * as Work from "@/features/tasks/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"

const hours = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  )
}

function Details({ id }: { id: string }) {
  const { t } = ReactI18next.useTranslation("Work")
  const client = ReactQuery.useQueryClient()
  const task = ReactQuery.useQuery(Queries.workTaskOptions({ path: { id } }))
  const [text, setText] = React.useState("")
  const comment = ReactQuery.useMutation({
    ...Queries.workCommentMutation(),
    onSuccess: () => {
      setText("")
      return client.invalidateQueries()
    },
    onError: (error) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  })

  if (task.isPending) return <Skeleton.Skeleton className="m-4 h-40" />
  if (task.data === undefined) return <p className="p-4 text-sm text-muted-foreground">{t("notFound")}</p>
  const found = task.data

  return (
    <div className="grid gap-4 overflow-y-auto px-4 pb-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("fields.status")}>{t(`status.${found.status}`)}</Field>
        <Field label={t("fields.assignee")}>{found.assignee === "owner" ? t("owner") : found.assignee}</Field>
        <Field label={t("fields.priority")}>{t(`priority.${found.priority}`)}</Field>
        <Field label={t("fields.deadline")}>{found.deadline ?? "—"}</Field>
        <Field label={t("fields.spent")}>{hours(found.spent)}</Field>
        <Field label={t("fields.estimate")}>{found.estimate === null ? "—" : hours(found.estimate)}</Field>
      </div>
      <Separator.Separator />
      <p className="text-sm whitespace-pre-wrap">{found.body.length > 0 ? found.body : t("noBody")}</p>
      {found.links.length > 0 && (
        <ul className="grid gap-1 text-sm">
          {found.links.map((link) => (
            <li key={link} className="truncate">
              <a className="underline underline-offset-2" href={link} target="_blank" rel="noreferrer">
                {link}
              </a>
            </li>
          ))}
        </ul>
      )}
      <Separator.Separator />
      <ol className="grid gap-3">
        {found.comments.map((one) => (
          <li key={one.id} className="grid gap-1">
            <span className="text-xs text-muted-foreground">
              {one.author === "owner" ? t("owner") : one.author} · {one.at.replace("T", " ")}
            </span>
            <p className="text-sm whitespace-pre-wrap">{one.text}</p>
          </li>
        ))}
      </ol>
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (text.trim().length > 0) comment.mutate({ path: { id }, body: { text: text.trim() } })
        }}
      >
        <Textarea.Textarea
          aria-label={t("comment")}
          placeholder={t("comment")}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <Button.Button
          className="justify-self-end"
          type="submit"
          disabled={comment.isPending || text.trim().length === 0}
        >
          {t("addComment")}
        </Button.Button>
      </form>
    </div>
  )
}

/** A task with its body, comments and links, opened beside the list it came from. */
export function TaskSheet({ id, title, onClose }: { id: string | null; title: string; onClose: () => void }) {
  return (
    <Sheet.Sheet open={id !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <Sheet.SheetContent className="data-[side=right]:sm:max-w-lg">
        <Sheet.SheetHeader>
          <Sheet.SheetTitle>{title}</Sheet.SheetTitle>
        </Sheet.SheetHeader>
        {id !== null && <Details id={id} />}
      </Sheet.SheetContent>
    </Sheet.Sheet>
  )
}
