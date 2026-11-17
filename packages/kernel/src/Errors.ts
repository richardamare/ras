import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

/** A module refuses with its own `code`; the caller reads `reason` and, when there is one, `instead`. */
export class Refused extends Schema.TaggedError<Refused>()(
  "Refused",
  { code: Schema.String, reason: Schema.String, instead: Schema.optionalKey(Schema.String) },
  { httpApiStatus: 409 }
) {
  override get message() {
    return this.instead === undefined ? this.reason : `${this.reason} ${this.instead}`
  }
}

export class NotFound extends Schema.TaggedError<NotFound>()(
  "NotFound",
  { subject: Schema.String, id: Schema.String },
  { httpApiStatus: 404 }
) {
  override get message() {
    return `There is no ${this.subject} ${this.id}.`
  }
}

/** Input that parses but cannot mean anything, such as a Prague local time that does not exist on that day. */
export class Invalid extends Schema.TaggedError<Invalid>()(
  "Invalid",
  { reason: Schema.String },
  { httpApiStatus: 400 }
) {
  override get message() {
    return this.reason
  }
}

/** `source` is the name the failing client gives its system, such as `graph`. */
export class SourceFailed extends Schema.TaggedError<SourceFailed>()(
  "SourceFailed",
  { source: Schema.String, reason: Schema.String },
  { httpApiStatus: 502 }
) {
  override get message() {
    return `${this.source}: ${this.reason}`
  }
}

export const Failure = Schema.Union([Refused, NotFound, Invalid, SourceFailed])
export type Failure = typeof Failure.Type

/** The value of `found`, or `NotFound` for `subject` and `id` when there is none. */
export const orNotFound =
  (subject: string, id: string) =>
  <A>(found: Option.Option<A>): Effect.Effect<A, NotFound> =>
    Option.match(found, { onNone: () => Effect.fail(new NotFound({ subject, id })), onSome: Effect.succeed })
