import { assert, layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Ref from "effect/Ref"
import * as Context from "effect/Context"
import * as HttpBody from "effect/http/HttpBody"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as SqlClient from "effect/sql/SqlClient"
import * as TestClock from "effect/testing/TestClock"
import * as Graph from "../../src/graph/Graph.ts"
import * as Testing from "../../src/Testing.ts"
import * as Writes from "../../src/audit/Writes.ts"

/** Microsoft's token endpoint as the test scripts it: each grant it saw, and the answer it gives. */
class Microsoft extends Context.Service<
  Microsoft,
  {
    readonly grants: Ref.Ref<ReadonlyArray<Record<string, string>>>
    readonly status: Ref.Ref<number>
  }
>()("test/Microsoft") {}

const idToken = `x.${Buffer.from(JSON.stringify({ email: "owner@outlook.com" })).toString("base64url")}.y`

const microsoft = Layer.effect(
  Microsoft,
  Effect.all({ grants: Ref.make<ReadonlyArray<Record<string, string>>>([]), status: Ref.make(200) })
)

const client = Layer.effect(
  HttpClient.HttpClient,
  Effect.map(Effect.service(Microsoft), ({ grants, status }) =>
    HttpClient.make((request) =>
      Effect.gen(function* () {
        const grant = Object.fromEntries(
          new URLSearchParams(new TextDecoder().decode((request.body as HttpBody.Uint8Array).body))
        )
        const seen = yield* Ref.updateAndGet(grants, (all) => [...all, grant])
        const answer = {
          access_token: `access-${seen.length}`,
          refresh_token: `refresh-${seen.length}`,
          expires_in: 3600,
          id_token: idToken
        }
        return HttpClientResponse.fromWeb(
          request,
          new Response(JSON.stringify(answer), {
            status: yield* Ref.get(status),
            headers: { "content-type": "application/json" }
          })
        )
      })
    )
  )
)

const connected = Layer.effect(Graph.Graph, Effect.orDie(Graph.Graph.make)).pipe(
  Layer.provideMerge(Writes.Writes.layer),
  Layer.provide(client),
  Layer.provideMerge(microsoft),
  Layer.provideMerge(Testing.database([])),
  Layer.provideMerge(Testing.signedIn),
  Layer.provide(Testing.settingsWith({ RAS_GRAPH_CLIENT_ID: "app-id", RAS_GRAPH_CLIENT_SECRET: "app-secret" }))
)

const connect = Effect.gen(function* () {
  const graph = yield* Graph.Graph
  const url = yield* graph.connect
  return yield* graph.complete(url.searchParams.get("state")!, "the-code")
})

layer(connected)("connecting Outlook", (test) => {
  test.effect("sends the owner to Microsoft's consumers sign-in with PKCE, for the calendar and a refresh token", () =>
    Effect.gen(function* () {
      const url = yield* (yield* Graph.Graph).connect
      assert.strictEqual(url.origin + url.pathname, "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize")
      const query = url.searchParams
      assert.strictEqual(query.get("redirect_uri"), "http://localhost:4100/graph/callback")
      assert.strictEqual(query.get("code_challenge_method"), "S256")
      assert.include(query.get("scope")!, "offline_access")
      assert.include(query.get("scope")!, "https://graph.microsoft.com/Calendars.ReadWrite")
    })
  )

  test.effect("stores the tokens sealed, audits the connection, and refuses the same state twice", () =>
    Effect.gen(function* () {
      const graph = yield* Graph.Graph
      const url = yield* graph.connect
      const state = url.searchParams.get("state")!
      const connection = yield* graph.complete(state, "the-code")
      assert.strictEqual(connection.account, "owner@outlook.com")
      const [grant] = yield* Ref.get((yield* Microsoft).grants)
      assert.strictEqual(grant!["grant_type"], "authorization_code")
      assert.strictEqual(grant!["code"], "the-code")
      assert.isString(grant!["code_verifier"])

      const sql = yield* SqlClient.SqlClient
      const [row] = yield* sql<{ access_token: string; refresh_token: string }>`SELECT * FROM global_graph_tokens`
      assert.notInclude(row!.access_token, "access-")
      assert.notInclude(row!.refresh_token, "refresh-")
      const audit = yield* sql<{ action: string; after: string }>`
        SELECT action, after FROM global_audit_entries WHERE subject = 'graph'`
      assert.deepStrictEqual(audit, [{ action: "global.graph.connected", after: '{"account":"owner@outlook.com"}' }])

      const again = yield* Effect.flip(graph.complete(state, "the-code"))
      assert.strictEqual(again._tag === "Refused" ? again.code : again._tag, "global.graph.attempt")
      assert.deepStrictEqual(
        Option.map(yield* graph.connection, (found) => found.account),
        Option.some("owner@outlook.com")
      )
    })
  )

  test.effect("refreshes the access token once it expires, with the refresh token Microsoft last sent", () =>
    Effect.gen(function* () {
      const graph = yield* Graph.Graph
      const { grants } = yield* Microsoft
      yield* Ref.set(grants, [])
      yield* connect
      assert.strictEqual(Redacted.value(yield* graph.token), "access-1")
      yield* TestClock.adjust("59 minutes")
      assert.strictEqual(Redacted.value(yield* graph.token), "access-2")
      assert.strictEqual(Redacted.value(yield* graph.token), "access-2")
      yield* TestClock.adjust("1 hour")
      assert.strictEqual(Redacted.value(yield* graph.token), "access-3")
      const sent = (yield* Ref.get(grants)).map((grant) => [grant["grant_type"], grant["refresh_token"] ?? null])
      assert.deepStrictEqual(sent, [
        ["authorization_code", null],
        ["refresh_token", "refresh-1"],
        ["refresh_token", "refresh-2"]
      ])
    })
  )

  test.effect("asks the owner to connect again when Microsoft refuses the refresh token", () =>
    Effect.gen(function* () {
      const graph = yield* Graph.Graph
      yield* connect
      yield* Ref.set((yield* Microsoft).status, 400)
      yield* TestClock.adjust("2 hours")
      const failure = yield* Effect.flip(graph.token)
      assert.strictEqual(failure._tag, "SourceFailed")
      assert.include(failure.reason, "Connect Outlook again")
      yield* Ref.set((yield* Microsoft).status, 200)
    })
  )
})
