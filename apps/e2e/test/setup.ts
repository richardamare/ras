import * as BunServices from "@effect/platform-bun/BunServices"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Scope from "effect/Scope"
import type * as Vitest from "vitest/node"
import * as Ras from "../src/Ras.ts"

declare module "vitest" {
  export interface ProvidedContext {
    readonly rasUrl: string
    readonly backupBucket: Readonly<Record<string, string>>
  }
}

/** One ras for the whole run; every test file reaches it at the URL this provides. */
export default async function setup(project: Vitest.TestProject) {
  const scope = Effect.runSync(Scope.make())
  const { url, bucket } = await Effect.runPromise(
    Ras.serve.pipe(Scope.provide(scope), Effect.provide(Layer.merge(BunServices.layer, FetchHttpClient.layer)))
  )
  project.provide("rasUrl", url.href)
  project.provide("backupBucket", bucket)
  return () => Effect.runPromise(Scope.close(scope, Exit.void))
}
