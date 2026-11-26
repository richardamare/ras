import { assert, describe, layer } from "@effect/vitest"
import * as Arr from "effect/Array"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as ApiTesting from "@ras/api/testing"
import * as Ras from "../src/Ras.ts"
import * as Suite from "../src/Suite.ts"

const backUp = (token: Option.Option<string>) =>
  Effect.gen(function* () {
    const { url } = yield* Suite.Server
    const request = HttpClientRequest.post(new URL("/backup", url))
    const response = yield* HttpClient.execute(
      Option.isSome(token) ? HttpClientRequest.bearerToken(request, token.value) : request
    )
    return response.status
  })

const googleToken = (claims: Readonly<Record<string, unknown>>) =>
  Effect.gen(function* () {
    const { url } = yield* Suite.Server
    const now = Math.floor((yield* Clock.currentTimeMillis) / 1000)
    return yield* ApiTesting.sampleIdToken({
      iss: "https://accounts.google.com",
      aud: new URL("/backup", url).href,
      email: Ras.schedulerAccount,
      email_verified: true,
      iat: now,
      exp: now + 3600,
      ...claims
    })
  })

const backups = Effect.gen(function* () {
  const { backupBucket } = yield* Suite.Server
  const bucket = new Bun.S3Client({
    endpoint: backupBucket.endpoint,
    bucket: backupBucket.name,
    accessKeyId: backupBucket.accessKeyId,
    secretAccessKey: backupBucket.secretAccessKey
  })
  const listed = yield* Effect.promise(() => bucket.list({ prefix: "ras-" }))
  return Option.fromNullishOr(listed.contents).pipe(
    Option.getOrElse(() => []),
    Arr.map((object) => object.key)
  )
})

describe("the backup route", () => {
  layer(Suite.layer, { excludeTestServices: true })("of a running ras", (it) => {
    it.effect("refuses a caller without a token with 401 and writes nothing", () =>
      Effect.gen(function* () {
        const before = yield* backups
        assert.strictEqual(yield* backUp(Option.none()), 401)
        assert.deepStrictEqual(yield* backups, before)
      })
    )

    it.effect("refuses a Google token for another audience with 403 and writes nothing", () =>
      Effect.gen(function* () {
        const before = yield* backups
        const token = yield* googleToken({ aud: "https://elsewhere.example/backup" })
        assert.strictEqual(yield* backUp(Option.some(token)), 403)
        assert.deepStrictEqual(yield* backups, before)
      })
    )

    it.effect("refuses a Google token for another account with 403 and writes nothing", () =>
      Effect.gen(function* () {
        const before = yield* backups
        const token = yield* googleToken({ email: "someone@ras-e2e.iam.gserviceaccount.com" })
        assert.strictEqual(yield* backUp(Option.some(token)), 403)
        assert.deepStrictEqual(yield* backups, before)
      })
    )

    it.effect("backs the database up to R2 for the Scheduler account's token", () =>
      Effect.gen(function* () {
        const before = yield* backups
        const token = yield* googleToken({})
        assert.strictEqual(yield* backUp(Option.some(token)), 204)
        const added = Arr.difference(yield* backups, before)
        assert.strictEqual(added.length, 1)
        assert.match(added[0]!, /^ras-\d{4}-\d{2}-\d{2}T\d{4}\.db$/)
      })
    )
  })
})
