import { assert, describe, layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Mcp from "../src/Mcp.ts"
import * as Suite from "../src/Suite.ts"

const ProtectedResource = Schema.Struct({ resource: Schema.String, authorization_servers: Schema.Array(Schema.String) })
const AuthorizationServer = Schema.Struct({
  issuer: Schema.String,
  registration_endpoint: Schema.String,
  code_challenge_methods_supported: Schema.Array(Schema.String)
})
const Initialized = Schema.Struct({ serverInfo: Schema.Struct({ name: Schema.String }) })
const Tools = Schema.Struct({ tools: Schema.Array(Schema.Struct({ name: Schema.String })) })
const Called = Schema.Struct({ isError: Schema.optionalKey(Schema.Boolean) })

const getJson = <S extends Schema.Constraint>(url: URL, schema: S) =>
  HttpClient.get(url).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(schema)),
    Effect.orDie
  )

/** A client registered as `name`, allowed by the owner in Chromium, with its access token. */
const allowed = (name: string) =>
  Effect.gen(function* () {
    const clientId = yield* Mcp.register(name)
    const { callback, verifier } = yield* Mcp.authorize(yield* Suite.page, clientId, "Allow")
    return { clientId, token: yield* Mcp.redeem(clientId, callback, verifier) }
  })

describe("the MCP connector", () => {
  layer(Suite.layer, { excludeTestServices: true })("at /mcp", (it) => {
    it.effect("challenges a request without a token and points the client at the authorization server", () =>
      Effect.gen(function* () {
        const { url } = yield* Suite.Server
        const refused = yield* Mcp.post(Option.none(), Option.none(), { id: 1, method: "tools/list" })
        assert.strictEqual(refused.status, 401)
        const metadata = /resource_metadata="([^"]+)"/.exec(refused.headers["www-authenticate"] ?? "")?.[1]
        assert.strictEqual(metadata, new URL("/.well-known/oauth-protected-resource/mcp", url).href)

        const resource = yield* getJson(new URL(metadata!), ProtectedResource)
        assert.strictEqual(resource.resource, new URL("/mcp", url).href)
        assert.deepStrictEqual(resource.authorization_servers, [new URL("/auth", url).href])

        const server = yield* getJson(new URL("/.well-known/oauth-authorization-server/auth", url), AuthorizationServer)
        assert.strictEqual(server.registration_endpoint, new URL("/auth/oauth2/register", url).href)
        assert.include(server.code_challenge_methods_supported, "S256")
      })
    )

    it.effect("refuses a token ras did not issue", () =>
      Effect.gen(function* () {
        const refused = yield* Mcp.post(Option.some("forged"), Option.none(), { id: 1, method: "tools/list" })
        assert.strictEqual(refused.status, 401)
      })
    )

    it.effect("answers a denied consent with access_denied and no code", () =>
      Effect.gen(function* () {
        const clientId = yield* Mcp.register("Denied e2e client")
        const { callback } = yield* Mcp.authorize(yield* Suite.page, clientId, "Deny")
        assert.strictEqual(callback.searchParams.get("error"), "access_denied")
        assert.isNull(callback.searchParams.get("code"))
      })
    )

    it.effect("connects a client the owner allowed in Chromium and lists every module's tools", () =>
      Effect.gen(function* () {
        const { token } = yield* allowed("Listing e2e client")
        const session = yield* Mcp.connect(token)
        const server = yield* Schema.decodeUnknownEffect(Initialized)(session.server)
        assert.strictEqual(server.serverInfo.name, "ras")

        const { tools } = yield* Effect.flatMap(session.request("tools/list"), Schema.decodeUnknownEffect(Tools))
        assert.includeMembers(
          tools.map((tool) => tool.name),
          ["whoami", "add_task", "tasks", "search_calendar", "search_mail", "memory_search"]
        )
      })
    )

    it.effect("runs a tool as the owner through the client, and the HTTP API sees what it wrote", () =>
      Effect.gen(function* () {
        const { token } = yield* allowed("Writing e2e client")
        const session = yield* Mcp.connect(token)
        const title = Suite.unique("Task from the connector")

        const called = yield* Effect.flatMap(
          session.request("tools/call", { name: "add_task", arguments: { title } }),
          Schema.decodeUnknownEffect(Called)
        )
        assert.notStrictEqual(called.isError, true)

        const client = yield* Suite.client(yield* Suite.sessionCookie)
        const tasks = yield* client.work.tasks({ query: {} })
        assert.isTrue(tasks.some((task) => task.title === title))
      })
    )

    it.effect("lists the client in the console's settings, and revoking it there refuses its token", () =>
      Effect.gen(function* () {
        const name = Suite.unique("Revoked e2e client")
        const { token } = yield* allowed(name)
        yield* Mcp.connect(token)

        const page = yield* Suite.signedInPage
        yield* Suite.use(() => page.goto("/settings"))
        const revoke = page.getByRole("button", { name: "Revoke" })
        const row = page
          .locator("div")
          .filter({ has: page.getByText(name, { exact: true }) })
          .filter({ has: revoke })
        yield* Suite.use(() => row.last().getByRole("button", { name: "Revoke" }).click())
        yield* Suite.use(() =>
          page
            .getByRole("dialog", { name: `Revoke ${name}?` })
            .getByRole("button", { name: "Revoke" })
            .click()
        )
        yield* Suite.use(() => page.getByText(name, { exact: true }).waitFor({ state: "detached" }))

        const refused = yield* Mcp.post(Option.some(token), Option.none(), { id: 1, method: "tools/list" })
        assert.strictEqual(refused.status, 401)
      })
    )
  })
})
