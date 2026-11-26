import * as Base64Url from "effect/encoding/Base64Url"
import * as Effect from "effect/Effect"
import * as SampleKey from "./backup/SampleKey.ts"

/** An S3-compatible endpoint holding one bucket in memory, with the settings that point `Backup.run` at it. */
export interface LocalS3 {
  readonly settings: Readonly<Record<string, string>>
  readonly objects: Map<string, Uint8Array>
}

const bucket = "ras-backups"

const listing = (keys: ReadonlyArray<string>) =>
  `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${bucket}</Name><KeyCount>${keys.length}</KeyCount><IsTruncated>false</IsTruncated>${keys
    .map((key) => `<Contents><Key>${key}</Key></Contents>`)
    .join("")}</ListBucketResult>`

/** Listens on a free port until the scope closes. */
export const localS3 = Effect.acquireRelease(
  Effect.sync(() => {
    const objects = new Map<string, Uint8Array>()
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        const key = decodeURIComponent(url.pathname.slice(`/${bucket}/`.length))
        if (request.method === "PUT") {
          objects.set(key, new Uint8Array(await request.arrayBuffer()))
          return new Response(null, { status: 200 })
        }
        if (request.method === "DELETE") {
          objects.delete(key)
          return new Response(null, { status: 204 })
        }
        if (key !== "") return new Response(null, { status: 404 })
        const prefix = url.searchParams.get("prefix") ?? ""
        return new Response(listing([...objects.keys()].filter((name) => name.startsWith(prefix))))
      }
    })
    return { server, objects }
  }),
  ({ server }) => Effect.promise(() => server.stop(true))
).pipe(
  Effect.map(({ server, objects }): LocalS3 => ({
    objects,
    settings: {
      RAS_BACKUP_R2_ENDPOINT: `http://localhost:${server.port}`,
      RAS_BACKUP_R2_BUCKET: bucket,
      RAS_BACKUP_R2_ACCESS_KEY_ID: "local",
      RAS_BACKUP_R2_SECRET_ACCESS_KEY: "local"
    }
  }))
)

/** A Google ID token with `claims`, signed by the key a sample ras trusts. */
export const sampleIdToken = (claims: Readonly<Record<string, unknown>>) =>
  Effect.promise(async () => {
    const key = await crypto.subtle.importKey(
      "jwk",
      SampleKey.privateKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    )
    const header = Base64Url.encode(JSON.stringify({ alg: "RS256", kid: SampleKey.privateKey.kid, typ: "JWT" }))
    const signed = `${header}.${Base64Url.encode(JSON.stringify(claims))}`
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signed))
    return `${signed}.${Base64Url.encode(new Uint8Array(signature))}`
  })
