import * as Schema from "effect/Schema"

/** A module refuses with its own `code`; the caller reads `reason` and, when there is one, `instead`. */
export class Refused extends Schema.TaggedError<Refused>()(
  "Refused",
  { code: Schema.String, reason: Schema.String, instead: Schema.optionalKey(Schema.String) },
  { httpApiStatus: 409 }
) {}

export class NotFound extends Schema.TaggedError<NotFound>()(
  "NotFound",
  { subject: Schema.String, id: Schema.String },
  { httpApiStatus: 404 }
) {}

/** Input that parses but cannot mean anything, such as a Prague local time that does not exist on that day. */
export class Invalid extends Schema.TaggedError<Invalid>()(
  "Invalid",
  { reason: Schema.String },
  { httpApiStatus: 400 }
) {}

/** `source` is the name the failing client gives its system, such as `graph`. */
export class SourceFailed extends Schema.TaggedError<SourceFailed>()(
  "SourceFailed",
  { source: Schema.String, reason: Schema.String },
  { httpApiStatus: 502 }
) {}

export const Failure = Schema.Union([Refused, NotFound, Invalid, SourceFailed])
export type Failure = typeof Failure.Type
