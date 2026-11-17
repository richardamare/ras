import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Shell from "../shell/Shell.ts"

export const repository = "richardamare/ras"

const Release = Schema.Struct({ tag_name: Schema.String })

/** The tag of the latest published release; GitHub never answers a prerelease or a draft here. */
export const latest = HttpClient.execute(
  HttpClientRequest.get(`https://api.github.com/repos/${repository}/releases/latest`).pipe(
    HttpClientRequest.setHeaders({ accept: "application/vnd.github+json", "user-agent": "rasctl" })
  )
).pipe(
  Effect.flatMap(HttpClientResponse.filterStatusOk),
  Effect.flatMap(HttpClientResponse.schemaBodyJson(Release)),
  Effect.map((release) => release.tag_name),
  Effect.mapError((error) => new Shell.Failed({ reason: `GitHub did not answer the latest release: ${error.message}` }))
)
