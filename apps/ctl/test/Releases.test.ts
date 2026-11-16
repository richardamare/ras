import { assert, describe, it } from "@effect/vitest"
import * as Launchd from "../src/Launchd.ts"
import * as Releases from "../src/Releases.ts"

describe("the releases", () => {
  it("expires all but the linked releases and the newest three", () => {
    const releases = [1, 2, 3, 4, 5].map((n) => ({ path: `/r/v0.${n}.0`, created: n }))
    assert.deepStrictEqual(Releases.expired(releases, ["/r/v0.1.0"]), ["/r/v0.2.0"])
  })

  it("fills a plist template with the host's folders, escaped for XML", () => {
    const layout = { state: "/Users/o/Library/Application Support/ras & co", logs: "/Users/o/Library/Logs/ras" }
    assert.strictEqual(
      Launchd.render("<string>__STATE__/current</string><string>__LOGS__/ras.log</string>", layout as never),
      "<string>/Users/o/Library/Application Support/ras &amp; co/current</string><string>/Users/o/Library/Logs/ras/ras.log</string>"
    )
  })
})
