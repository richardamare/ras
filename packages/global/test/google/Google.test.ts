import { assert, layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Ref from "effect/Ref"
import * as HttpBody from "effect/http/HttpBody"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as SqlClient from "effect/sql/SqlClient"
import * as TestClock from "effect/testing/TestClock"
import * as Google from "../../src/google/Google.ts"
import * as Testing from "../../src/Testing.ts"
import * as Writes from "../../src/audit/Writes.ts"

const idToken = `x.${Buffer.from(JSON.stringify({ email: "owner@gmail.com" })).toString("base64url")}.y`

/** Google's token endpoint: it sends a refresh token with the code grant only, as Google does. */
const grants = Ref.makeUnsafe<ReadonlyArray<Record<string, string>>>([])

const client = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.gen(function* () {
      const grant = Object.fromEntries(
        new URLSearchParams(new TextDecoder().decode((request.body as HttpBody.Uint8Array).body))
      )
      const seen = yield* Ref.updateAndGet(grants, (all) => [...all, grant])
      const answer = {
        access_token: `access-${seen.length}`,
        ...(grant["grant_type"] === "authorization_code" ? { refresh_token: "refresh", id_token: idToken } : {}),
        expires_in: 3600
      }
      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(answer), { status: 200, headers: { "content-type": "application/json" } })
      )
    })
  )
)

const connected = Layer.effect(Google.Google, Effect.orDie(Google.make)).pipe(
  Layer.provideMerge(Writes.Writes.layer),
  Layer.provide(client),
  Layer.provideMerge(Testing.database([])),
  Layer.provideMerge(Testing.signedIn),
  Layer.provide(Testing.settingsWith({ RAS_GOOGLE_CLIENT_ID: "app-id", RAS_GOOGLE_CLIENT_SECRET: "app-secret" }))
)

layer(connected)("connecting Google", (test) => {
  test.effect("sends the owner to Google's sign-in with PKCE, for calendar events and offline access", () =>
    Effect.gen(function* () {
      const url = yield* (yield* Google.Google).connect
      assert.strictEqual(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth")
      const query = url.searchParams
      assert.strictEqual(query.get("redirect_uri"), "http://localhost:4100/google/callback")
      assert.strictEqual(query.get("code_challenge_method"), "S256")
      assert.strictEqual(query.get("access_type"), "offline")
      assert.include(query.get("prompt")!, "consent")
      assert.include(query.get("scope")!, "https://www.googleapis.com/auth/calendar.events")
    })
  )

  test.effect("stores the tokens sealed, audits the connection, and keeps the refresh token a refresh omits", () =>
    Effect.gen(function* () {
      const google = yield* Google.Google
      const url = yield* google.connect
      const connection = yield* google.complete(url.searchParams.get("state")!, "the-code")
      assert.strictEqual(connection.account, "owner@gmail.com")

      const sql = yield* SqlClient.SqlClient
      const [row] = yield* sql<{ access_token: string }>`SELECT * FROM global_google_tokens`
      assert.notInclude(row!.access_token, "access-")
      const audit = yield* sql<{ action: string }>`SELECT action FROM global_audit_entries WHERE subject = 'google'`
      assert.deepStrictEqual(audit, [{ action: "global.google.connected" }])

      assert.strictEqual(Redacted.value(yield* google.token), "access-1")
      yield* TestClock.adjust("59 minutes")
      assert.strictEqual(Redacted.value(yield* google.token), "access-2")
      yield* TestClock.adjust("1 hour")
      assert.strictEqual(Redacted.value(yield* google.token), "access-3")
      const sent = (yield* Ref.get(grants)).map((grant) => [grant["grant_type"], grant["refresh_token"] ?? null])
      assert.deepStrictEqual(sent, [
        ["authorization_code", null],
        ["refresh_token", "refresh"],
        ["refresh_token", "refresh"]
      ])
      assert.isUndefined((yield* Ref.get(grants))[0]!["scope"])
    })
  )
})
