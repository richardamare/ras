import { assert, describe, layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as Global from "@ras/global"
import * as Ras from "../src/Ras.ts"
import * as Suite from "../src/Suite.ts"

const slug = (prefix: string) => Global.AgentSlug.make(`${prefix}-${crypto.randomUUID().slice(0, 8)}`)

/** A push to the memory webhook, signed with `secret`. */
const push = (secret: string, event: string) =>
  Effect.gen(function* () {
    const { url } = yield* Suite.Server
    const body = JSON.stringify({ ref: "refs/heads/master" })
    const signature = `sha256=${new Bun.CryptoHasher("sha256", secret).update(body).digest("hex")}`
    return yield* HttpClientRequest.post(new URL("/webhooks/github", url)).pipe(
      HttpClientRequest.setHeaders({
        "content-type": "application/json",
        "x-github-event": event,
        "x-hub-signature-256": signature
      }),
      HttpClientRequest.bodyText(body, "application/json"),
      HttpClient.execute
    )
  })

describe("the global API and ras's own routes", () => {
  layer(Suite.layer, { excludeTestServices: true })("of a running ras", (it) => {
    it.effect("refuses an agent whose slug is taken, and archiving one that does not exist", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const taken = slug("taken")
        yield* client.global.addAgent({ payload: { slug: taken, name: "First" } })
        assert.strictEqual(
          yield* Suite.refusal(client.global.addAgent({ payload: { slug: taken, name: "Second" } })),
          "global.agent.exists"
        )
        assert.strictEqual(
          yield* Suite.refusal(client.global.archiveAgent({ params: { slug: slug("missing") } })),
          "NotFound"
        )
      })
    )

    it.effect("refuses an archived agent as an assignee", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const retired = slug("retired")
        yield* client.global.addAgent({ payload: { slug: retired, name: "Retired" } })
        yield* client.global.archiveAgent({ params: { slug: retired } })
        assert.strictEqual(
          yield* Suite.refusal(client.work.addTask({ payload: { title: Suite.unique("Theirs"), assignee: retired } })),
          "global.agent.archived"
        )
      })
    )

    it.effect("says Outlook is not connected, and refuses to connect it without a Microsoft app", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        assert.isNull(yield* client.global.graph())
        assert.strictEqual(yield* Suite.refusal(client.global.connectGraph()), "global.graph.unset")
      })
    )

    it.effect("says Google is not connected, and refuses to connect it without a Google app", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        assert.isNull(yield* client.global.google())
        assert.strictEqual(yield* Suite.refusal(client.global.connectGoogle()), "global.google.unset")
      })
    )

    it.effect("reports each outside system as sample data, checks one on demand, and refuses an unknown one", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const connections = yield* client.global.connections()
        assert.deepStrictEqual(
          connections.map((connection) => [connection.kind, connection.state]),
          [
            ["outlook", "sample"],
            ["google", "sample"],
            ["reclaim", "sample"],
            ["icloud", "sample"],
            ["github", "sample"]
          ]
        )
        const checked = yield* client.global.checkConnection({ params: { kind: "reclaim" } })
        assert.deepInclude(checked, { kind: "reclaim", state: "sample" })

        const { url } = yield* Suite.Server
        const unknown = yield* HttpClientRequest.post(new URL("/global/connections/dropbox/check", url)).pipe(
          HttpClientRequest.setHeader("cookie", yield* Suite.sessionCookie),
          HttpClient.execute
        )
        assert.strictEqual(unknown.status, 400)
      })
    )

    it.effect("answers Microsoft's and Google's callbacks without a grant with a 400 page", () =>
      Effect.gen(function* () {
        const { url } = yield* Suite.Server
        const microsoft = yield* HttpClient.get(new URL("/graph/callback?error_description=Declined", url))
        assert.strictEqual(microsoft.status, 400)
        assert.include(yield* microsoft.text, "Declined")
        const google = yield* HttpClient.get(new URL("/google/callback?error=access_denied", url))
        assert.strictEqual(google.status, 400)
        assert.include(yield* google.text, "Google sent no grant back")
      })
    )

    it.effect("answers 404 for revoking a client that does not exist", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        assert.strictEqual(
          yield* Suite.refusal(client.global.revokeClient({ params: { id: "no-such-client" } })),
          "NotFound"
        )
      })
    )

    it.effect("ends the session on sign-out, after which the API answers 401", () =>
      Effect.gen(function* () {
        const { url } = yield* Suite.Server
        const cookie = yield* Suite.sessionCookie
        const client = yield* Suite.client(cookie)
        assert.strictEqual((yield* client.global.whoami()).channel, "Console")

        const signedOut = yield* HttpClientRequest.post(new URL("/auth/sign-out", url)).pipe(
          HttpClientRequest.setHeaders({ cookie, origin: url.origin }),
          HttpClientRequest.bodyJsonUnsafe({}),
          HttpClient.execute
        )
        assert.strictEqual(signedOut.status, 200)
        assert.strictEqual(yield* Suite.refusal(client.global.whoami()), "Unauthorized")
      })
    )

    it.effect("refuses a sign-in with the wrong password, and a sign-up", () =>
      Effect.gen(function* () {
        const { url } = yield* Suite.Server
        const post = (path: string, body: object) =>
          HttpClientRequest.post(new URL(path, url)).pipe(
            HttpClientRequest.setHeader("origin", url.origin),
            HttpClientRequest.bodyJsonUnsafe(body),
            HttpClient.execute
          )
        const wrong = yield* post("/auth/sign-in/email", { email: Ras.owner.email, password: "wrong-password" })
        assert.strictEqual(wrong.status, 401)
        const signUp = yield* post("/auth/sign-up/email", {
          email: "intruder@e2e.test",
          password: "intruder-password",
          name: "Intruder"
        })
        assert.isAtLeast(signUp.status, 400)
      })
    )

    it.effect("takes a signed push to the memory webhook, and refuses a forged one", () =>
      Effect.gen(function* () {
        assert.strictEqual((yield* push(Ras.webhookSecret, "push")).status, 202)
        assert.strictEqual((yield* push(Ras.webhookSecret, "ping")).status, 204)
        assert.strictEqual((yield* push("forged-secret", "push")).status, 401)
      })
    )
  })
})
