import * as Schema from "effect/Schema"
import * as Time from "@ras/kernel/Time"

export class Client extends Schema.Class<Client>("McpClient")({
  id: Schema.String,
  name: Schema.String,
  scopes: Schema.Array(Schema.String),
  connected: Time.PragueLocal,
  used: Schema.NullOr(Time.PragueLocal).annotate({ description: "When it last renewed its access." })
}) {}
