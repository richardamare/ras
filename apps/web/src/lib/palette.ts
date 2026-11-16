import * as React from "react"

export const PALETTES = ["blue", "brand"] as const

export type Palette = (typeof PALETTES)[number]

// Namespaced like the theme key, because Teams tabs share an origin with other apps.
export const PALETTE_KEY = "ras-palette"

const readPalette = (): Palette => (localStorage.getItem(PALETTE_KEY) === "brand" ? "brand" : "blue")

const applyPalette = (palette: Palette) => {
  document.documentElement.classList.toggle("palette-blue", palette === "blue")
}

/** Runs before the first render, so the page never paints in the brand colours before switching to blue. */
export const initPalette = () => {
  applyPalette(readPalette())
}

export const usePalette = () => {
  const [palette, setPaletteState] = React.useState(readPalette)

  const setPalette = (next: Palette) => {
    localStorage.setItem(PALETTE_KEY, next)
    applyPalette(next)
    setPaletteState(next)
  }

  return { palette, setPalette }
}
