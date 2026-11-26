import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Base64Url from "effect/encoding/Base64Url"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Errors from "@ras/kernel/Errors"
import * as Sample from "@ras/kernel/Sample"
import * as SampleKey from "./SampleKey.ts"

/** The claims of a Google ID token whose signature, issuer and expiry hold; whom it is for is the caller's to judge. */
export const Claims = Schema.Struct({
  iss: Schema.String,
  aud: Schema.String,
  email: Schema.String,
  exp: Schema.Number
})
export type Claims = typeof Claims.Type

export class InvalidToken extends Schema.TaggedError<InvalidToken>()("InvalidToken", { reason: Schema.String }) {}

export class GoogleIdTokens extends Context.Service<
  GoogleIdTokens,
  { readonly verify: (token: string) => Effect.Effect<Claims, InvalidToken | Errors.SourceFailed> }
>()("@ras/api/GoogleIdTokens") {}

const Jwk = Schema.Struct({ kid: Schema.String, kty: Schema.String, n: Schema.String, e: Schema.String })
type Jwk = typeof Jwk.Type

const Header = Schema.fromJsonString(Schema.Struct({ alg: Schema.Literal("RS256"), kid: Schema.String }))
const Payload = Schema.fromJsonString(Claims)

const issuers = ["https://accounts.google.com", "accounts.google.com"]

const invalid = (reason: string) => new InvalidToken({ reason })

const decoded = <S extends Schema.Decoder<unknown>>(schema: S, part: string, what: string) =>
  Result.match(Base64Url.decodeString(part), {
    onFailure: () => Effect.fail(invalid(`The token's ${what} is not base64url.`)),
    onSuccess: (json) =>
      Schema.decodeUnknownEffect(schema)(json).pipe(
        Effect.mapError(() => invalid(`The token's ${what} is not what Google signs.`))
      )
  })

/** Verifies tokens against the signing keys `keys` yields, which a token names by `kid`. */
const make = (keys: Effect.Effect<ReadonlyArray<Jwk>, Errors.SourceFailed>) =>
  GoogleIdTokens.of({
    verify: (token) =>
      Effect.gen(function* () {
        const parts = token.split(".")
        if (parts.length !== 3) return yield* Effect.fail(invalid("The token is not a JWT."))
        const [header, payload, signature] = parts as [string, string, string]
        const { kid } = yield* decoded(Header, header, "header")
        const jwk = Arr.findFirst(yield* keys, (key) => key.kid === kid)
        if (Option.isNone(jwk)) return yield* Effect.fail(invalid("The token is signed by a key Google does not hold."))
        const signed = Base64Url.decode(signature)
        if (Result.isFailure(signed)) return yield* Effect.fail(invalid("The token's signature is not base64url."))
        const valid = yield* Effect.promise(async () => {
          const key = await crypto.subtle.importKey(
            "jwk",
            jwk.value,
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
            false,
            ["verify"]
          )
          return crypto.subtle.verify(
            "RSASSA-PKCS1-v1_5",
            key,
            new Uint8Array(signed.success),
            new TextEncoder().encode(`${header}.${payload}`)
          )
        })
        if (!valid) return yield* Effect.fail(invalid("The token's signature does not match."))
        const claims = yield* decoded(Payload, payload, "payload")
        if (!issuers.includes(claims.iss)) return yield* Effect.fail(invalid("Google did not issue the token."))
        const now = yield* DateTime.now
        if (claims.exp * 1000 <= DateTime.toEpochMillis(now)) return yield* Effect.fail(invalid("The token expired."))
        return claims
      })
  })

const Certs = Schema.Struct({ keys: Schema.Array(Jwk) })

/** Verifies against the keys Google publishes, fetched on each verification, since a backup asks once a night. */
const live = Layer.effect(
  GoogleIdTokens,
  Effect.map(Effect.service(HttpClient.HttpClient), (http) =>
    make(
      http.get("https://www.googleapis.com/oauth2/v3/certs").pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(Certs)),
        Effect.map((certs) => certs.keys),
        Effect.mapError(
          () => new Errors.SourceFailed({ source: "google", reason: "Google's signing keys could not be read." })
        )
      )
    )
  )
).pipe(Layer.provide(FetchHttpClient.layer))

const { kid, kty, n, e } = SampleKey.privateKey
const sample = Layer.succeed(GoogleIdTokens, make(Effect.succeed([{ kid, kty, n, e }])))

/** Google's keys, or in sample mode the sample key alone. */
export const layer = Sample.choose({ sample, live })
