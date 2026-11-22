import * as Vitest from "vitest"

import * as Hours from "@/features/insights/hours"

Vitest.describe("insights hours", () => {
  Vitest.it("shows minutes as h:mm and as decimal hours", () => {
    Vitest.expect(Hours.clock(2250)).toBe("37:30")
    Vitest.expect(Hours.decimal(2250, "en")).toBe("37.5 h")
    Vitest.expect(Hours.decimal(2250, "cs")).toBe("37,5 h")
  })

  Vitest.it("shows an empty period as zero", () => {
    Vitest.expect(Hours.clock(0)).toBe("0:00")
    Vitest.expect(Hours.decimal(0, "en")).toBe("0 h")
  })

  Vitest.it("keeps the minutes that are no quarter hour", () => {
    Vitest.expect(Hours.clock(487)).toBe("8:07")
    Vitest.expect(Hours.decimal(487, "en")).toBe("8.12 h")
  })
})
