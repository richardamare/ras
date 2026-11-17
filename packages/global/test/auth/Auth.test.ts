import { assert, describe, layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Testing from "@ras/global/testing"
import * as Auth from "../../src/auth/Auth.ts"
import * as Owner from "../../src/auth/Owner.ts"

const signIn = (email: string, password: string) =>
  Effect.flatMap(Effect.service(Auth.Auth), (auth) =>
    Effect.promise(() =>
      auth.handler(
        new Request("http://localhost:4100/auth/sign-in/email", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:4100" },
          body: JSON.stringify({ email, password })
        })
      )
    )
  )

const App = Auth.Auth.layer.pipe(Layer.provideMerge(Testing.database([])), Layer.provide(Testing.settings))

describe("Auth", () => {
  layer(App)("the owner", (test) => {
    test.effect("has every table better-auth needs from the migrations", () =>
      Effect.gen(function* () {
        assert.strictEqual((yield* Auth.schemaSql).replace(/[\s;]/g, ""), "")
      })
    )

    test.effect("signs in with the password `ras owner` set, and nobody signs up", () =>
      Effect.gen(function* () {
        assert.strictEqual(yield* Owner.set("owner@example.com", Redacted.make("a long password")), "created")
        assert.strictEqual((yield* signIn("owner@example.com", "a long password")).status, 200)
        assert.strictEqual((yield* signIn("owner@example.com", "a wrong password")).status, 401)
        const auth = yield* Auth.Auth
        const signUp = yield* Effect.promise(() =>
          auth.handler(
            new Request("http://localhost:4100/auth/sign-up/email", {
              method: "POST",
              headers: { "content-type": "application/json", origin: "http://localhost:4100" },
              body: JSON.stringify({ email: "someone@example.com", password: "a long password", name: "Someone" })
            })
          )
        )
        assert.notStrictEqual(signUp.status, 200)
      })
    )

    test.effect("sets a new password for the owner and refuses a second account", () =>
      Effect.gen(function* () {
        assert.strictEqual(yield* Owner.set("owner@example.com", Redacted.make("another long one")), "updated")
        assert.strictEqual((yield* signIn("owner@example.com", "another long one")).status, 200)
        const refused = yield* Effect.flip(Owner.set("second@example.com", Redacted.make("a long password")))
        assert.strictEqual(refused._tag, "Refused")
      })
    )
  })

  layer(App)("a client that registers itself", (test) => {
    test.effect("may ask for every scope ras offers when it names none at registration", () =>
      Effect.gen(function* () {
        const auth = yield* Auth.Auth
        const response = yield* Effect.promise(() =>
          auth.handler(
            new Request("http://localhost:4100/auth/oauth2/register", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                client_name: "probe",
                redirect_uris: ["https://client.example.com/callback"],
                token_endpoint_auth_method: "none"
              })
            })
          )
        )
        const client = (yield* Effect.promise(() => response.json())) as { readonly scope: string }
        assert.deepStrictEqual(client.scope.split(" ").toSorted(), ["email", "offline_access", "openid", "profile"])
      })
    )
  })
})
