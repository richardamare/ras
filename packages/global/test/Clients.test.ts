import { assert, layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as SqlClient from "effect/sql/SqlClient"
import * as Global from "@ras/global"
import * as Testing from "@ras/global/testing"
import * as OAuthClientRepository from "../src/OAuthClientRepository.ts"

const connect = (clientId: string, name: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO global_oauth_clients (id, clientId, name, redirectUris, createdAt, updatedAt)
               VALUES (${clientId}, ${clientId}, ${name}, '["https://client.example.com/cb"]', '2026-11-17T08:00:00.000Z', '2026-11-17T08:00:00.000Z')`
    yield* sql`INSERT INTO global_oauth_consents (id, clientId, userId, scopes, createdAt, updatedAt)
               VALUES (${`consent-${clientId}`}, ${clientId}, 'owner', '["openid","offline_access"]',
                       '2026-11-17T09:00:00.000Z', '2026-11-17T09:00:00.000Z')`
    yield* sql`INSERT INTO global_oauth_refresh_tokens (id, token, clientId, userId, scopes, expiresAt, createdAt)
               VALUES (${`refresh-${clientId}`}, ${`token-${clientId}`}, ${clientId}, 'owner', '["openid"]',
                       '2026-12-17T09:00:00.000Z', '2026-11-17T10:30:00.000Z')`
  })

const consentName = (clientId: string) =>
  Effect.gen(function* () {
    const consent = yield* (yield* OAuthClientRepository.OAuthClientRepository).consent(clientId, "owner")
    return Option.flatMap(consent, (found) => found.name)
  }).pipe(Effect.provide(OAuthClientRepository.OAuthClientRepository.layer))

const revoked = (clientId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ revoked: string | null }>`
      SELECT revoked FROM global_oauth_refresh_tokens WHERE clientId = ${clientId}`
    return rows.map((row) => row.revoked !== null)
  })

layer(Testing.layer([]))("MCP clients", (test) => {
  test.effect("lists a client the owner consented to, with its scopes and when it last renewed its access", () =>
    Effect.gen(function* () {
      yield* connect("claude", "Claude")
      const [client] = yield* (yield* Global.Clients).list
      assert.deepStrictEqual(
        [client?.id, client?.name, client?.scopes, client?.connected, client?.used],
        ["claude", "Claude", ["openid", "offline_access"], "2026-11-17T10:00", "2026-11-17T11:30"]
      )
    })
  )

  test.effect("revokes a client: its consent goes, its refresh tokens stop working and the audit records it", () =>
    Effect.gen(function* () {
      yield* connect("cursor", "Cursor")
      const clients = yield* Global.Clients
      yield* clients.revoke("cursor")
      assert.deepStrictEqual(
        (yield* clients.list).map((client) => client.id),
        ["claude"]
      )
      assert.deepStrictEqual(yield* revoked("cursor"), [true])
      assert.deepStrictEqual(yield* revoked("claude"), [false])
      assert.isTrue(Option.isNone(yield* consentName("cursor")))
      assert.deepStrictEqual(yield* consentName("claude"), Option.some("Claude"))
      const sql = yield* SqlClient.SqlClient
      const [entry] = yield* sql<{ action: string; subject: string }>`
        SELECT action, subject FROM global_audit_entries ORDER BY id DESC LIMIT 1`
      assert.deepStrictEqual(entry, { action: "global.client.revoked", subject: "client/cursor" })
    })
  )

  test.effect("refuses to revoke a client the owner never connected", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip((yield* Global.Clients).revoke("ghost"))
      assert.strictEqual(error._tag, "NotFound")
    })
  )
})
