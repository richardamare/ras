/** The owner's clock. Every time the API answers is a Prague local time, `2026-10-22T09:00`. */
const zone = "Europe/Prague"

const parts = (instant: Date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value])
  )

/** The Prague local time of `instant`, to the minute. */
export const local = (instant: Date = new Date()) => {
  const { year, month, day, hour, minute } = parts(instant)
  return `${year}-${month}-${day}T${hour}:${minute}`
}

export const today = (instant: Date = new Date()) => local(instant).slice(0, 10)

export const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Monday 0 to Sunday 6. */
export const weekday = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7

/** Minutes from one Prague local time to another, read as wall-clock times. */
export const minutesBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}:00Z`) - Date.parse(`${from}:00Z`)) / 60_000)
