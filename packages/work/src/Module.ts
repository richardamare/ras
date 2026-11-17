import * as Layer from "effect/Layer"
import * as Module from "@ras/kernel/Module"
import * as BlockRepository from "./blocks/BlockRepository.ts"
import * as Blocks from "./blocks/Blocks.ts"
import * as Board from "./board/Board.ts"
import * as Drafts from "./drafts/Drafts.ts"
import * as Http from "./Http.ts"
import * as Migrations from "./Migrations.ts"
import * as ProjectRepository from "./board/ProjectRepository.ts"
import * as SpaceRepository from "./board/SpaceRepository.ts"
import * as TaskRepository from "./board/TaskRepository.ts"
import * as Tools from "./Tools.ts"

export const module = Module.make({
  name: "work",
  migrations: Migrations.migrations,
  services: Layer.mergeAll(Board.Board.layer, Drafts.Drafts.layer).pipe(
    Layer.provideMerge(Blocks.Blocks.layer),
    Layer.provide(
      Layer.mergeAll(
        SpaceRepository.SpaceRepository.layer,
        ProjectRepository.ProjectRepository.layer,
        TaskRepository.TaskRepository.layer,
        BlockRepository.BlockRepository.layer
      )
    )
  ),
  ports: Blocks.Blocks.busyTime,
  http: { group: Http.group, handlers: Http.handlers },
  tools: { toolkit: Tools.toolkit, handlers: Tools.handlers }
})
