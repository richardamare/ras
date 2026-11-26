export const key = "ras-insights-calendars"

/**
 * The calendars the address names, or without them the ones this browser last ticked that the page still lists; until
 * the list arrives, every remembered one.
 */
export const chosenOf = (
  fromUrl: ReadonlyArray<number> | null,
  stored: ReadonlyArray<number>,
  listed: ReadonlyArray<number> | undefined
) => fromUrl ?? (listed === undefined ? stored : stored.filter((id) => listed.includes(id)))

export const toggled = (chosen: ReadonlyArray<number>, calendar: number): ReadonlyArray<number> =>
  (chosen.includes(calendar) ? chosen.filter((one) => one !== calendar) : [...chosen, calendar]).toSorted(
    (a, b) => a - b
  )
