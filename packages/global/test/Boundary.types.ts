import * as Effect from "effect/Effect"
import * as Global from "@ras/global"

// @ts-expect-error a store write needs the Transaction that only Writes.run provides
export const outside: Effect.Effect<void> = Global.write(Effect.void)
