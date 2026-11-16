import type * as Layer from "effect/Layer"
import type * as SqlClient from "effect/sql/SqlClient"
import * as Api from "../src/Api.ts"

export const needsOnlySqlite: Layer.Layer<any, any, SqlClient.SqlClient> = Api.Services
