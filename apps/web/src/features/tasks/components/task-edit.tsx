import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"

import * as IconButton from "@/components/icon-button"
import * as Button from "@/components/ui/button"
import * as Input from "@/components/ui/input"
import * as Select from "@/components/ui/select"
import * as Textarea from "@/components/ui/textarea"
import * as Work from "@/features/tasks/lib/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import type * as Api from "@/lib/api/generated/types.gen"
import * as Prague from "@/lib/prague"
import * as UseChange from "@/features/tasks/hooks/use-change"
import * as UseDeleteTask from "@/features/tasks/hooks/use-delete-task"
import * as UseSettled from "@/features/tasks/hooks/use-settled"

export type Task = Api.TaskEncoded
export type Change = Api.WorkChangeTaskData["body"]

const noProject = "none"
const trigger = "h-7 w-full bg-background"

/** The title and the brief, edited together and saved with one write. */
export function BriefForm({ task, onDone }: { task: Task; onDone: () => void }) {
  const { t } = ReactI18next.useTranslation("Work")
  const save = UseChange.useChange(task.id)
  const [title, setTitle] = React.useState(task.title)
  const [body, setBody] = React.useState(task.body)

  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        const change: Change = {
          ...(title.trim() === task.title ? {} : { title: title.trim() }),
          ...(body.trim() === task.body ? {} : { body: body.trim() })
        }
        if (Object.keys(change).length === 0) return onDone()
        save(change, onDone)
      }}
    >
      <Input.Input
        autoFocus
        required
        aria-label={t("fields.title")}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Textarea.Textarea
        rows={6}
        aria-label={t("brief")}
        placeholder={t("noBody")}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button.Button type="button" variant="outline" size="sm" onClick={onDone}>
          {t("edit.cancel")}
        </Button.Button>
        <Button.Button type="submit" size="sm" disabled={title.trim() === ""}>
          {t("edit.save")}
        </Button.Button>
      </div>
    </form>
  )
}

export function ProjectSelect({ task }: { task: Task }) {
  const { t } = ReactI18next.useTranslation("Work")
  const save = UseChange.useChange(task.id)
  const projects = ReactQuery.useQuery(Queries.workProjectsOptions())
  const choices = (projects.data ?? []).filter((one) => one.status !== "done" || one.id === task.project)

  return (
    <Select.Select
      value={task.project ?? noProject}
      onValueChange={(value) => save({ project: value === noProject ? null : value })}
    >
      <Select.SelectTrigger size="sm" aria-label={t("fields.project")} className={trigger}>
        <Select.SelectValue />
      </Select.SelectTrigger>
      <Select.SelectContent>
        <Select.SelectItem value={noProject}>{t("newTask.noProject")}</Select.SelectItem>
        {choices.map((one) => (
          <Select.SelectItem key={one.id} value={one.id}>
            {one.name}
          </Select.SelectItem>
        ))}
      </Select.SelectContent>
    </Select.Select>
  )
}

export function PrioritySelect({ task }: { task: Task }) {
  const { t } = ReactI18next.useTranslation("Work")
  const save = UseChange.useChange(task.id)
  return (
    <Select.Select value={task.priority} onValueChange={(value) => save({ priority: value as Task["priority"] })}>
      <Select.SelectTrigger size="sm" aria-label={t("fields.priority")} className={trigger}>
        <Select.SelectValue />
      </Select.SelectTrigger>
      <Select.SelectContent>
        {Work.priorities.map((priority) => (
          <Select.SelectItem key={priority} value={priority}>
            {t(`priority.${priority}`)}
          </Select.SelectItem>
        ))}
      </Select.SelectContent>
    </Select.Select>
  )
}

/** Saves the day once the input holds a whole date, and clears the deadline once it is emptied. */
export function DeadlineInput({ task }: { task: Task }) {
  const { t } = ReactI18next.useTranslation("Work")
  const save = UseChange.useChange(task.id)
  const overdue = task.deadline !== null && task.status !== "done" && task.deadline < Prague.today()
  return (
    <Input.Input
      type="date"
      aria-label={t("fields.deadline")}
      aria-invalid={overdue || undefined}
      className="h-7 bg-background"
      value={task.deadline ?? ""}
      onChange={(event) => {
        const day = event.target.value === "" ? null : event.target.value
        if (day !== task.deadline) save({ deadline: day })
      }}
    />
  )
}

/** Takes `1:30` or a plain count of minutes; saves on Enter or when it loses focus, and an empty box clears it. */
export function EstimateInput({ task }: { task: Task }) {
  const { t } = ReactI18next.useTranslation("Work")
  const save = UseChange.useChange(task.id)
  const shown = task.estimate === null ? "" : Prague.duration(task.estimate)
  const [text, setText] = React.useState(shown)
  React.useEffect(() => setText(shown), [shown])

  const commit = () => {
    const minutes = Work.minutesOf(text)
    if (minutes === undefined) {
      Sonner.toast.error(t("edit.badEstimate"))
      return setText(shown)
    }
    if (minutes !== task.estimate) save({ estimate: minutes })
  }

  return (
    <Input.Input
      inputMode="numeric"
      aria-label={t("fields.estimate")}
      placeholder="h:mm"
      className="h-7 bg-background tabular-nums"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
      }}
    />
  )
}

/** The GitHub issues and pull requests on the task, each with a button to detach it, and a box to attach another. */
export function Links({ task }: { task: Task }) {
  const { t } = ReactI18next.useTranslation("Work")
  const settled = UseSettled.useSettled()
  const [url, setUrl] = React.useState("")
  const link = ReactQuery.useMutation({
    ...Queries.workLinkMutation(),
    ...settled,
    onSuccess: () => {
      setUrl("")
      return settled.onSuccess()
    }
  })
  const unlink = ReactQuery.useMutation({ ...Queries.workUnlinkMutation(), ...settled })

  return (
    <div className="grid gap-1.5">
      {task.links.length > 0 && (
        <ul className="grid gap-1 text-sm">
          {task.links.map((one) => (
            <li key={one} className="flex min-w-0 items-center gap-1.5">
              <LucideReact.LinkIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <a
                className="truncate text-primary underline-offset-2 hover:underline"
                href={one}
                target="_blank"
                rel="noreferrer"
              >
                {one}
              </a>
              <IconButton.IconButton
                label={t("links.remove", { url: one })}
                className="ms-auto size-6 shrink-0 [&_svg]:size-3.5"
                disabled={unlink.isPending}
                onClick={() => unlink.mutate({ path: { id: task.id }, query: { url: one } })}
              >
                <LucideReact.XIcon />
              </IconButton.IconButton>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          link.mutate({ path: { id: task.id }, body: { url: url.trim() } })
        }}
      >
        <Input.Input
          type="url"
          aria-label={t("links.url")}
          placeholder={t("links.placeholder")}
          className="h-8"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <Button.Button type="submit" variant="outline" size="sm" disabled={url.trim() === "" || link.isPending}>
          {t("links.add")}
        </Button.Button>
      </form>
    </div>
  )
}

export function DeleteButton({ task, onDeleted }: { task: Task; onDeleted: () => void }) {
  const { t } = ReactI18next.useTranslation("Work")
  const ask = UseDeleteTask.useDeleteTask(onDeleted)
  return (
    <IconButton.IconButton
      label={t("delete.button")}
      className="-my-1 size-8 shrink-0 text-destructive"
      onClick={() => ask(task)}
    >
      <LucideReact.Trash2Icon />
    </IconButton.IconButton>
  )
}
