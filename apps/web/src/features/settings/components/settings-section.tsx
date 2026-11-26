import type * as React from "react"

import * as Card from "@/components/ui/card"

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
