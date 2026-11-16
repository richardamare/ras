import * as Server from "react-dom/server"
import * as Vitest from "vitest"

import * as LoadingButton from "@/components/loading-button"

const LABEL = "Save"

Vitest.describe("the loading button", () => {
  Vitest.test("while loading it spins and cannot be pressed again", () => {
    const html = Server.renderToStaticMarkup(<LoadingButton.LoadingButton loading>{LABEL}</LoadingButton.LoadingButton>)

    Vitest.expect(html).toContain('data-slot="spinner"')
    Vitest.expect(html).toContain('disabled=""')
    Vitest.expect(html).toContain('aria-busy="true"')
  })

  Vitest.test("at rest it is a plain button", () => {
    const html = Server.renderToStaticMarkup(<LoadingButton.LoadingButton>{LABEL}</LoadingButton.LoadingButton>)

    Vitest.expect(html).not.toContain('data-slot="spinner"')
    Vitest.expect(html).not.toContain('disabled=""')
    Vitest.expect(html).not.toContain("aria-busy")
  })
})
