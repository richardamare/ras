import * as LucideReact from "lucide-react"

export type NavChild = {
  to: string
  label: string
  /** Active only on this exact path, for a child that is also the parent's landing page. */
  exact?: boolean
}

export type NavEntry = {
  to: string
  label: string
  icon: LucideReact.LucideIcon
  /** Sub-pages, nested under the parent in the sidebar. */
  children?: NavChild[]
}

export type NavSection = {
  label: string
  entries: NavEntry[]
}
