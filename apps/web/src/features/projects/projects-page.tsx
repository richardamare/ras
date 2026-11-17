import * as ReactQuery from "@tanstack/react-query"
import * as ReactRouter from "@tanstack/react-router"
import * as ReactI18next from "react-i18next"

import * as PageHeader from "@/components/page-header"
import * as Badge from "@/components/ui/badge"
import * as Skeleton from "@/components/ui/skeleton"
import * as Table from "@/components/ui/table"
import * as Progress from "@/features/projects/progress"
import * as TaskBits from "@/features/tasks/task-bits"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"

export function ProjectsPage() {
  const { t } = ReactI18next.useTranslation("Work")
  const navigate = ReactRouter.useNavigate()
  const projects = ReactQuery.useQuery(Queries.workProjectsOptions())
  const spaces = ReactQuery.useQuery(Queries.workSpacesOptions())
  const tasks = ReactQuery.useQuery(Queries.workTasksOptions())

  const spaceNames = new Map((spaces.data ?? []).map((one) => [one.id, one.name]))
  const progress = Progress.progressOf(tasks.data ?? [])

  return (
    <div className="grid gap-4">
      <PageHeader.PageHeader title={t("projects.title")} />
      {projects.isPending ? (
        <Skeleton.Skeleton className="h-40 w-full" />
      ) : (projects.data ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {t("projects.none")}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table.Table>
            <Table.TableHeader className="bg-muted/50">
              <Table.TableRow>
                <Table.TableHead className="ps-4">{t("fields.project")}</Table.TableHead>
                <Table.TableHead>{t("fields.status")}</Table.TableHead>
                <Table.TableHead>{t("fields.deadline")}</Table.TableHead>
                <Table.TableHead>{t("fields.space")}</Table.TableHead>
                <Table.TableHead>{t("fields.progress")}</Table.TableHead>
              </Table.TableRow>
            </Table.TableHeader>
            <Table.TableBody>
              {(projects.data ?? []).map((project) => {
                const { done, total } = progress.get(project.id) ?? { done: 0, total: 0 }
                return (
                  <Table.TableRow
                    key={project.id}
                    className="cursor-pointer"
                    onClick={() => void navigate({ to: "/projects/$id", params: { id: project.id } })}
                  >
                    <Table.TableCell className="ps-4 font-medium">
                      <ReactRouter.Link
                        to="/projects/$id"
                        params={{ id: project.id }}
                        className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        {project.name}
                      </ReactRouter.Link>
                    </Table.TableCell>
                    <Table.TableCell>
                      <Badge.Badge variant={project.status === "active" ? "secondary" : "outline"}>
                        {t(`projectStatus.${project.status}`)}
                      </Badge.Badge>
                    </Table.TableCell>
                    <Table.TableCell>
                      <TaskBits.Due
                        task={{ deadline: project.deadline, status: project.status === "done" ? "done" : "todo" }}
                      />
                    </Table.TableCell>
                    <Table.TableCell>{spaceNames.get(project.space)}</Table.TableCell>
                    <Table.TableCell>
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-28 overflow-hidden rounded-full bg-secondary ring-1 ring-border ring-inset">
                          <span
                            className="block h-full bg-primary"
                            style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
                          />
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {t("projects.progress", { done, total })}
                        </span>
                      </span>
                    </Table.TableCell>
                  </Table.TableRow>
                )
              })}
            </Table.TableBody>
          </Table.Table>
        </div>
      )}
    </div>
  )
}
