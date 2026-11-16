import type * as React from "react"
import * as NextThemes from "next-themes"

const THEME_KEY = "ras-theme"

type ThemeProviderProps = {
  children: React.ReactNode
}

/**
 * `storageKey` is namespaced because the app runs as a Teams tab on origins shared with other
 * apps; the default `theme` key lets one app's choice leak into another's.
 */
export const ThemeProvider = (props: ThemeProviderProps) => {
  const { children } = props

  return (
    <NextThemes.ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey={THEME_KEY}
    >
      {children}
    </NextThemes.ThemeProvider>
  )
}
