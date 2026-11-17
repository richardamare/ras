import * as Vitest from "vitest"
import * as Cmdk from "cmdk"

import * as Combobox from "@/components/combobox"

const id = "01a1eac4-fed4-7370-b731-3a91e28fedce"

Vitest.describe("the combobox's filter", () => {
  Vitest.it("keeps an option whose label holds what was typed, in any case", () => {
    Vitest.assert.isAbove(Combobox.filter(id, "LOGISTICS", ["Logistics fb9d0b0a"]), 0)
    Vitest.assert.isAbove(Combobox.filter(id, "b0a", ["Logistics fb9d0b0a"]), 0)
  })

  Vitest.it("drops an option whose id alone matches what was typed", () => {
    Vitest.assert.isAbove(Cmdk.defaultFilter(id, "1eac7b3e", ["Logistics fb9d0b0a"]), 0)
    Vitest.assert.strictEqual(Combobox.filter(id, "1eac7b3e", ["Logistics fb9d0b0a"]), 0)
  })
})
