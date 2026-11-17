import * as ReactQuery from "@tanstack/react-query"
import * as ReactRouter from "@tanstack/react-router"
import * as ReactI18next from "react-i18next"

import * as Badge from "@/components/ui/badge"
import * as Skeleton from "@/components/ui/skeleton"
import * as Table from "@/components/ui/table"
import * as Progress from "@/features/projects/progress"
import * as Queries from "@/lib/api/generated/@tanstack/react-query.gen"

export function ProjectsPage() {
  const { t } = ReactI18next.useTranslation("Work")
  const projects = ReactQuery.useQuery(Queries.workProjectsOptions())
  const spaces = ReactQuery.useQuery(Queries.workSpacesOptions())
  const tasks = ReactQuery.useQuery(Queries.workTasksOptions())

  const spaceNames = new Map((spaces.data ?? []).map((one) => [one.id, one.name]))
  const progress = Progress.progressOf(tasks.data ?? [])

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("projects.title")}</h1>
      {projects.isPending ? (
        <Skeleton.Skeleton className="h-40 w-full" />
      ) : (projects.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("projects.none")}</p>
      ) : (
        <Table.Table>
          <Table.TableHeader>
            <Table.TableRow>
              <Table.TableHead>{t("fields.project")}</Table.TableHead>
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
                <Table.TableRow key={project.id}>
                  <Table.TableCell className="font-medium">
                    <ReactRouter.Link
                      to="/projects/$id"
                      params={{ id: project.id }}
                      className="underline-offset-4 hover:underline"
                    >
                      {project.name}
                    </ReactRouter.Link>
                  </Table.TableCell>
                  <Table.TableCell>
                    <Badge.Badge variant={project.status === "active" ? "secondary" : "outline"}>
                      {t(`projectStatus.${project.status}`)}
                    </Badge.Badge>
                  </Table.TableCell>
                  <Table.TableCell className="tabular-nums">{project.deadline ?? "—"}</Table.TableCell>
                  <Table.TableCell>{spaceNames.get(project.space)}</Table.TableCell>
                  <Table.TableCell>
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
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
      )}
    </div>
  )
}
