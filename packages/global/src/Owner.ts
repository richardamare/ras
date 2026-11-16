import * as BetterAuthContext from "@better-auth/core/context"
import * as Effect from "effect/Effect"
import * as Redacted from "effect/Redacted"
import * as Errors from "@ras/kernel/Errors"
import * as Auth from "./Auth.ts"

/**
 * Creates the owner's account, or sets its password when it exists. ras has one account: a second email is refused.
 */
export const set = (email: string, password: Redacted.Redacted) =>
  Effect.gen(function* () {
    const auth = yield* Auth.Auth
    const context = yield* Effect.promise(() => auth.$context)
    const { minPasswordLength } = context.password.config
    if (Redacted.value(password).length < minPasswordLength) {
      return yield* new Errors.Invalid({ reason: `The password needs at least ${minPasswordLength} characters.` })
    }
    const hash = yield* Effect.promise(() => context.password.hash(Redacted.value(password)))
    const owner = yield* Effect.promise(() => context.internalAdapter.findUserByEmail(email))
    if (owner !== null) {
      yield* Effect.promise(() => context.internalAdapter.updatePassword(owner.user.id, hash))
      return "updated" as const
    }
    if ((yield* Effect.promise(() => context.internalAdapter.countTotalUsers())) > 0) {
      return yield* new Errors.Refused({
        code: "global.owner.exists",
        reason: "ras already has an owner with another email.",
        instead: "Run `ras owner` with the owner's email to set a new password."
      })
    }
    yield* Effect.promise(() =>
      BetterAuthContext.runWithTransaction(context.adapter, async () => {
        const user = await context.internalAdapter.createUser(
          { email, name: email, emailVerified: true },
          { method: "admin" }
        )
        await context.internalAdapter.linkAccount({
          userId: user.id,
          providerId: "credential",
          accountId: user.id,
          password: hash
        })
      })
    )
    return "created" as const
  })
