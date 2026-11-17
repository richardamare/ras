import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"

import * as Button from "@/components/ui/button"
import * as Dialog from "@/components/ui/dialog"
import * as Select from "@/components/ui/select"
import * as Skeleton from "@/components/ui/skeleton"
import * as Textarea from "@/components/ui/textarea"
import * as Columns from "@/features/board/columns"
import * as TaskSheet from "@/features/tasks/task-sheet"
import * as Work from "@/features/tasks/work"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import type * as Api from "@/lib/api/generated/types.gen"
import * as Utils from "@/lib/utils"

type Task = Api.TaskSummaryEncoded

const all = "all"

function Filter({
  label,
  value,
  onChange,
  options
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: ReadonlyArray<{ value: string; label: string }>
}) {
  const { t } = ReactI18next.useTranslation("Work")
  return (
    <Select.Select value={value} onValueChange={onChange}>
      <Select.SelectTrigger aria-label={label} className="min-w-40">
        <Select.SelectValue />
      </Select.SelectTrigger>
      <Select.SelectContent>
        <Select.SelectItem value={all}>{t("board.all", { what: label })}</Select.SelectItem>
        {options.map((option) => (
          <Select.SelectItem key={option.value} value={option.value}>
            {option.label}
          </Select.SelectItem>
        ))}
      </Select.SelectContent>
    </Select.Select>
  )
}

function Card({ task, projects, onOpen }: { task: Task; projects: Map<string, string>; onOpen: () => void }) {
  const { t } = ReactI18next.useTranslation("Work")
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => event.dataTransfer.setData("text/plain", task.id)}
      onClick={onOpen}
      className="grid w-full cursor-grab gap-1 rounded-lg border bg-card p-2 text-left text-sm shadow-xs hover:border-ring active:cursor-grabbing"
    >
      <span className="font-medium">{task.title}</span>
      <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
        {task.project !== null && <span>{projects.get(task.project)}</span>}
        <span>{task.assignee === "owner" ? t("owner") : task.assignee}</span>
        {task.priority !== "normal" && <span>{t(`priority.${task.priority}`)}</span>}
        {task.deadline !== null && <span>{task.deadline}</span>}
      </span>
    </button>
  )
}

/** The comment a move into `blocked` or `review` takes. */
function MoveDialog({
  move,
  onClose,
  onMove
}: {
  move: { task: Task; status: Work.Status } | null
  onClose: () => void
  onMove: (comment: string) => void
}) {
  const { t } = ReactI18next.useTranslation("Work")
  const [comment, setComment] = React.useState("")
  return (
    <Dialog.Dialog
      open={move !== null}
      onOpenChange={(open) => {
        if (!open) {
          setComment("")
          onClose()
        }
      }}
    >
      <Dialog.DialogContent>
        <Dialog.DialogHeader>
          <Dialog.DialogTitle>
            {move === null ? "" : t("board.moveTitle", { task: move.task.title, status: t(`status.${move.status}`) })}
          </Dialog.DialogTitle>
          <Dialog.DialogDescription>
            {move?.status === "blocked" ? t("board.whatIsNeeded") : t("board.whatToCheck")}
          </Dialog.DialogDescription>
        </Dialog.DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            onMove(comment.trim())
            setComment("")
          }}
        >
          <Textarea.Textarea
            aria-label={t("comment")}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
          <Button.Button className="justify-self-end" type="submit" disabled={comment.trim().length === 0}>
            {t("board.move")}
          </Button.Button>
        </form>
      </Dialog.DialogContent>
    </Dialog.Dialog>
  )
}

export function BoardPage() {
  const { t } = ReactI18next.useTranslation("Work")
  const client = ReactQuery.useQueryClient()
  const [assignee, setAssignee] = React.useState(all)
  const [space, setSpace] = React.useState(all)
  const [project, setProject] = React.useState(all)
  const [over, setOver] = React.useState<Work.Status | null>(null)
  const [move, setMove] = React.useState<{ task: Task; status: Work.Status } | null>(null)
  const [open, setOpen] = React.useState<Task | null>(null)

  const query = {
    ...(assignee === all ? {} : { assignee }),
    ...(space === all ? {} : { space }),
    ...(project === all ? {} : { project })
  }
  const tasks = ReactQuery.useQuery(Queries.workTasksOptions({ query }))
  const agents = ReactQuery.useQuery(Queries.globalAgentsOptions())
  const spaces = ReactQuery.useQuery(Queries.workSpacesOptions())
  const projects = ReactQuery.useQuery(Queries.workProjectsOptions())
  const projectNames = new Map((projects.data ?? []).map((one) => [one.id, one.name]))

  const change = ReactQuery.useMutation({
    ...Queries.workChangeTaskMutation(),
    onSuccess: () => client.invalidateQueries(),
    onError: (error) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  })

  const drop = (status: Work.Status, id: string) => {
    setOver(null)
    const task = (tasks.data ?? []).find((one) => one.id === id)
    if (task === undefined || task.status === status) return
    if (Work.explained.includes(status)) setMove({ task, status })
    else change.mutate({ path: { id }, body: { status } })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="me-auto text-2xl font-semibold tracking-tight">{t("board.title")}</h1>
        <Filter
          label={t("fields.assignee")}
          value={assignee}
          onChange={setAssignee}
          options={[
            { value: "owner", label: t("owner") },
            ...(agents.data ?? []).map((agent) => ({ value: agent.slug, label: agent.name }))
          ]}
        />
        <Filter
          label={t("fields.space")}
          value={space}
          onChange={(value) => {
            setSpace(value)
            setProject(all)
          }}
          options={(spaces.data ?? [])
            .filter((one) => !one.archived)
            .map((one) => ({ value: one.id, label: one.name }))}
        />
        <Filter
          label={t("fields.project")}
          value={project}
          onChange={setProject}
          options={(projects.data ?? [])
            .filter((one) => space === all || one.space === space)
            .map((one) => ({ value: one.id, label: one.name }))}
        />
      </div>
      {tasks.isPending ? (
        <Skeleton.Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid min-h-0 flex-1 auto-cols-[minmax(14rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
          {Columns.columns(tasks.data ?? []).map((column) => (
            <section
              key={column.status}
              aria-label={t(`status.${column.status}`)}
              onDragOver={(event) => {
                event.preventDefault()
                setOver(column.status)
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(event) => {
                event.preventDefault()
                drop(column.status, event.dataTransfer.getData("text/plain"))
              }}
              className={Utils.cn(
                "flex min-h-40 flex-col gap-2 rounded-xl bg-muted/40 p-2 transition-colors",
                over === column.status && "bg-muted ring-2 ring-ring/40"
              )}
            >
              <h2 className="flex items-center gap-2 px-1 text-sm font-semibold">
                {t(`status.${column.status}`)}
                <span className="text-xs font-normal text-muted-foreground tabular-nums">{column.tasks.length}</span>
              </h2>
              {column.tasks.map((task) => (
                <Card key={task.id} task={task} projects={projectNames} onOpen={() => setOpen(task)} />
              ))}
            </section>
          ))}
        </div>
      )}
      <MoveDialog
        move={move}
        onClose={() => setMove(null)}
        onMove={(comment) => {
          if (move !== null) change.mutate({ path: { id: move.task.id }, body: { status: move.status, comment } })
          setMove(null)
        }}
      />
      <TaskSheet.TaskSheet id={open?.id ?? null} title={open?.title ?? ""} onClose={() => setOpen(null)} />
    </div>
  )
}
