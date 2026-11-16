"use client"

import * as NextThemes from "next-themes"
import * as Sonner from "sonner"
import * as LucideReact from "lucide-react"

const Toaster = ({ ...props }: Sonner.ToasterProps) => {
  const { theme = "system" } = NextThemes.useTheme()

  return (
    <Sonner.Toaster
      theme={theme as "light" | "dark" | "system"}
      className="toaster group"
      icons={{
        success: <LucideReact.CircleCheckIcon className="size-4" />,
        info: <LucideReact.InfoIcon className="size-4" />,
        warning: <LucideReact.TriangleAlertIcon className="size-4" />,
        error: <LucideReact.OctagonXIcon className="size-4" />,
        loading: <LucideReact.Loader2Icon className="size-4 animate-spin" />
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)"
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast"
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
