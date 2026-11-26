import * as BunServices from "@effect/platform-bun/BunServices"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Lock from "../../src/deploy/Lock.ts"
import * as Shell from "../../src/shell/Shell.ts"

const lockIn = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  return path.join(yield* fs.makeTempDirectoryScoped({ prefix: "ras-lock-" }), "deploy.lock")
})

const services = Shell.Shell.layer.pipe(Layer.provideMerge(BunServices.layer))

describe("the deploy lock", () => {
  it.effect("refuses a second deploy while a live process holds it", () =>
    Effect.gen(function* () {
      const lock = yield* lockIn
      const second = yield* Effect.exit(Lock.held(lock, process.pid)(Lock.held(lock, process.pid)(Effect.void)))
      assert.isTrue(Exit.isFailure(second))
    }).pipe(Effect.scoped, Effect.provide(services))
  )

  it.effect("takes over a lock whose process died, and lets it go after", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const lock = yield* lockIn
      yield* fs.writeFileString(lock, "999999")
      const holder = yield* Lock.held(lock, process.pid)(fs.readFileString(lock))
      assert.strictEqual(holder, String(process.pid))
      assert.isFalse(yield* fs.exists(lock))
    }).pipe(Effect.scoped, Effect.provide(services))
  )
})
