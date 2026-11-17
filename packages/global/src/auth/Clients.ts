import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Errors from "@ras/kernel/Errors"
import type * as Actor from "../audit/Actor.ts"
import * as Client from "./Client.ts"
import * as OAuthClientRepository from "./OAuthClientRepository.ts"
import * as Writes from "../audit/Writes.ts"

/** The MCP clients the owner connected through the consent page. */
export class Clients extends Context.Service<
  Clients,
  {
    readonly list: Effect.Effect<ReadonlyArray<Client.Client>>
    /** Cuts the client off at once: its tokens stop working and it has to sign in and consent again. */
    readonly revoke: (id: string) => Effect.Effect<void, Errors.NotFound, Actor.CurrentActor>
  }
>()("@ras/global/Clients") {
  static readonly layer = Layer.effect(
    Clients,
    Effect.gen(function* () {
      const writes = yield* Writes.Writes
      const clients = yield* OAuthClientRepository.OAuthClientRepository

      const list = clients.consented

      return Clients.of({
        list,
        revoke: (id) =>
          Effect.gen(function* () {
            const found = (yield* list).find((client) => client.id === id)
            if (found === undefined) return yield* new Errors.NotFound({ subject: "client", id })
            const at = DateTime.formatIso(yield* DateTime.now)
            yield* writes.run(
              "global.client.revoked",
              clients.revoke(id, at).pipe(
                Effect.as({
                  result: undefined,
                  subject: `client/${id}`,
                  before: Option.some({ name: found.name, scopes: found.scopes }),
                  after: Option.none()
                })
              )
            )
          })
      })
    })
  ).pipe(Layer.provide(OAuthClientRepository.OAuthClientRepository.layer))
}
