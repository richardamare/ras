import * as ReactQuery from "@tanstack/react-query"
import * as LucideReact from "lucide-react"
import * as ReactI18next from "react-i18next"

import * as IconButton from "@/components/icon-button"
import * as Skeleton from "@/components/ui/skeleton"
import * as UseBlockMoveDialog from "@/features/tasks/hooks/use-block-move-dialog"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"
import * as Prague from "@/lib/prague"
import * as Utils from "@/lib/utils"
import * as UseRemoveBlock from "@/features/tasks/hooks/use-remove-block"

/** The task's work blocks, latest first, each one moved, resized or removed unless it is running. */
export function WorkLog({ task }: { task: string }) {
  const { t, i18n } = ReactI18next.useTranslation("Work")
  const blocks = ReactQuery.useQuery(Queries.workTaskBlocksOptions({ path: { id: task } }))
  const moveDialog = UseBlockMoveDialog.useBlockMoveDialog()
  const remove = UseRemoveBlock.useRemoveBlock()
  const day = new Intl.DateTimeFormat(i18n.language, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC"
  })

  if (blocks.isPending) return <Skeleton.Skeleton className="h-8" />
  const listed = (blocks.data ?? []).toReversed()
  if (listed.length === 0) return <p className="text-sm text-muted-foreground">{t("log.empty")}</p>

  return (
    <ul className="grid gap-0.5">
      {listed.map((block) => (
        <li key={block.id} className="group flex items-center gap-3 rounded-md py-0.5 ps-2 text-sm hover:bg-muted/50">
          <span className="w-24 shrink-0 whitespace-nowrap first-letter:uppercase">
            {day.format(new Date(`${block.start.slice(0, 10)}T12:00:00Z`))}
          </span>
          <span className="tabular-nums">
            {block.start.slice(11)}–{block.end?.slice(11) ?? ""}
          </span>
          <span className="text-muted-foreground tabular-nums">
            {block.end !== null && Prague.duration(Prague.minutesBetween(block.start, block.end))}
          </span>
          <span
            className={Utils.cn(
              "text-xs text-muted-foreground",
              block.state === "running" && "font-medium text-primary"
            )}
          >
            {t(`log.state.${block.state}`)}
          </span>
          {block.state !== "running" && (
            <span className="ms-auto flex">
              <IconButton.IconButton
                label={t("log.edit")}
                className="size-7"
                onClick={() => moveDialog.open({ block })}
              >
                <LucideReact.PencilIcon />
              </IconButton.IconButton>
              <IconButton.IconButton
                label={t("log.remove")}
                className="size-7 text-destructive"
                onClick={() => remove(block)}
              >
                <LucideReact.Trash2Icon />
              </IconButton.IconButton>
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
