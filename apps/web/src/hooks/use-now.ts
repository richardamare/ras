import * as React from "react"

import * as Prague from "@/lib/prague"

/** The Prague local time, ticking every `period` milliseconds. */
export const useNow = (period: number) => {
  const [now, setNow] = React.useState(() => Prague.local())
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Prague.local()), period)
    return () => clearInterval(timer)
  }, [period])
  return now
}
