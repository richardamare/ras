import * as Prague from "@/lib/prague"

/** Minutes as `h:mm`, the exact time. */
export const clock = Prague.duration

/** Minutes as decimal hours, to two places, in the reader's language. */
export const decimal = (minutes: number, language: string) =>
  `${new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(minutes / 60)} h`
