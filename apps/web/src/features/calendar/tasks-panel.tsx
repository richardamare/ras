import * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"

import * as IconButton from "@/components/icon-button"
import * as Input from "@/components/ui/input"
import * as Pointer from "@/features/calendar/pointer"
import * as Completion from "@/features/tasks/completion"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import * as Utils from "@/lib/utils"

/** A drawer over the grid's right edge with the open tasks; a task dropped on the grid plans a block. */
export function TasksPanel({ onClose }: { onClose: () => void }) {
  const { t } = ReactI18next.useTranslation("Calendar")
  const [search, setSearch] = React.useState("")
  const tasks = ReactQuery.useQuery(Queries.workTasksOptions())
  const completion = Completion.useTaskCompletion()
  const projects = ReactQuery.useQuery(Queries.workProjectsOptions())
  const projectNames = new Map((projects.data ?? []).map((one) => [one.id, one.name]))
  const term = search.trim().toLowerCase()
  const open = (tasks.data ?? []).filter(
    (task) => task.status !== "done" && (term === "" || task.title.toLowerCase().includes(term))
  )

  return (
    <aside
      aria-label={t("planner.title")}
      className="absolute inset-y-2 end-2 z-40 flex w-72 flex-col gap-3 overflow-hidden rounded-xl border bg-background p-3 shadow-lg"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("planner.title")}</h2>
        <IconButton.IconButton label={t("planner.close")} onClick={onClose}>
          <LucideReact.XIcon />
        </IconButton.IconButton>
      </div>
      <Input.Input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t("planner.search")}
        aria-label={t("planner.search")}
      />
      <p className="text-xs text-muted-foreground">{t("planner.hint")}</p>
      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("planner.empty")}</p>
      ) : (
        <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          {open.map((task) => {
            const phase = completion.phaseOf(task.id)
            return (
              <li
                key={task.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "copy"
                  event.dataTransfer.setData(Pointer.taskDragType, task.id)
                }}
                className={Utils.cn(
                  "flex cursor-grab items-start gap-2 rounded-md border bg-card px-2.5 py-2 text-sm",
                  phase !== undefined && Completion.rowClass[phase]
                )}
              >
                <span className="mt-0.5 flex">
                  <Completion.DoneCheckbox task={task} />
                </span>
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-medium">{task.title}</span>
                  {task.project !== null && (
                    <span className="truncate text-xs text-muted-foreground">{projectNames.get(task.project)}</span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
