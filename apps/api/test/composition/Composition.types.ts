import type * as FileSystem from "effect/FileSystem"
import type * as Layer from "effect/Layer"
import type * as Path from "effect/Path"
import type * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import type * as SqlClient from "effect/sql/SqlClient"
import * as Api from "../../src/composition/Api.ts"

/** The modules' services need only the database and the platform the host runs on. */
export const needsOnlyTheHost: Layer.Layer<
  any,
  any,
  SqlClient.SqlClient | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> = Api.Services
