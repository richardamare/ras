import type * as React from "react"
import * as ReactQuery from "@tanstack/react-query"
import * as ReactI18next from "react-i18next"
import * as Sonner from "sonner"

import * as Card from "@/components/ui/card"
import * as Work from "@/features/tasks/lib/work"

/** Settles every write the same way: refetch on success, the refusal's reason on failure. */
export const useSettle = () => {
  const { t } = ReactI18next.useTranslation("Settings")
  const client = ReactQuery.useQueryClient()
  return {
    onSuccess: () => client.invalidateQueries(),
    onError: (error: unknown) => Sonner.toast.error(Work.reasonOf(error) ?? t("failed"))
  }
}

export function Section({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card.Card>
      <Card.CardHeader>
        <Card.CardTitle>{title}</Card.CardTitle>
        <Card.CardDescription>{description}</Card.CardDescription>
      </Card.CardHeader>
      <Card.CardContent className="grid gap-3">{children}</Card.CardContent>
    </Card.Card>
  )
}

export function Row({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 ${muted ? "opacity-60" : ""}`}>
      {children}
    </div>
  )
}
