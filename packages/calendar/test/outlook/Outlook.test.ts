import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Global from "@ras/global"
import * as Time from "@ras/kernel/Time"
import * as Outlook from "../../src/outlook/Outlook.ts"

/** Graph as the test scripts it: the requests it saw, and one answer for every request. */
const graph = (status: number, body: unknown) => {
  const seen: Array<HttpClientRequest.HttpClientRequest> = []
  const layer = Layer.effect(Outlook.Outlook, Outlook.make).pipe(
    Layer.provide(
      Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.sync(() => {
            seen.push(request)
            return HttpClientResponse.fromWeb(request, new Response(JSON.stringify(body), { status }))
          })
        )
      )
    ),
    Layer.provide(
      Layer.succeed(
        Global.Graph,
        Global.Graph.of({
          connect: Effect.die("unused"),
          complete: () => Effect.die("unused"),
          connection: Effect.succeed(Option.none()),
          token: Effect.succeed(Redacted.make("the-token"))
        })
      )
    )
  )
  return { seen, layer }
}

describe("Outlook", () => {
  it.effect("creates an event in a calendar with the owner's token, asking for Prague's clock back", () => {
    const { seen, layer } = graph(201, { id: "new-id", webLink: "https://outlook.live.com/x" })
    return Effect.gen(function* () {
      const created = yield* (yield* Outlook.Outlook).create("cal/1", { subject: "Call", transactionId: "t" })
      assert.deepStrictEqual(created, { id: "new-id", link: "https://outlook.live.com/x" })
      const [request] = seen
      assert.strictEqual(request!.method, "POST")
      assert.strictEqual(request!.url, "https://graph.microsoft.com/v1.0/me/calendars/cal%2F1/events")
      assert.strictEqual(request!.headers["authorization"], "Bearer the-token")
      assert.strictEqual(request!.headers["prefer"], 'outlook.timezone="Europe/Prague"')
    }).pipe(Effect.provide(layer))
  })

  it.effect("finds the occurrence of a series that starts at the given Prague time", () => {
    const { seen, layer } = graph(200, {
      value: [
        { id: "morning", start: { dateTime: "2027-03-29T09:00:00.0000000" } },
        { id: "evening", start: { dateTime: "2027-03-29T18:00:00.0000000" } }
      ]
    })
    return Effect.gen(function* () {
      const id = yield* (yield* Outlook.Outlook).occurrence("series", Time.PragueLocal.make("2027-03-29T18:00"))
      assert.strictEqual(id, "evening")
      const url = new URL(seen[0]!.url)
      assert.strictEqual(url.pathname, "/v1.0/me/events/series/instances")
      assert.strictEqual(url.searchParams.get("startDateTime"), "2027-03-29T00:00:00")
      assert.strictEqual(url.searchParams.get("endDateTime"), "2027-03-30T00:00:00")
    }).pipe(Effect.provide(layer))
  })

  it.effect("tells the owner to search again when Outlook no longer has the event", () => {
    const { layer } = graph(404, { error: { code: "ErrorItemNotFound" } })
    return Effect.gen(function* () {
      const failure = yield* Effect.flip((yield* Outlook.Outlook).cancel("gone"))
      assert.strictEqual(failure.reason, "Outlook no longer has that event. Search the calendar again.")
    }).pipe(Effect.provide(layer))
  })
})
