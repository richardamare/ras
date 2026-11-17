import type * as React from "react"

export function PageHeader({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <h1 className="me-auto text-2xl font-semibold tracking-tight">{title}</h1>
      {children}
    </div>
  )
}
