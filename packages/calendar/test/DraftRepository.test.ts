import { assert, layer } from "@effect/vitest"
import * as Arr from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Global from "@ras/global"
import * as Testing from "@ras/global/testing"
import * as KernelModule from "@ras/kernel/Module"
import * as Domain from "../src/Domain.ts"
import * as DraftRepository from "../src/DraftRepository.ts"
import * as Migrations from "../src/Migrations.ts"

const tables = KernelModule.make({ name: "calendar", migrations: Migrations.migrations })

const at = (iso: string) => DateTime.makeUnsafe(iso)

const draft = (id: string, title: string, start: string, end: string): DraftRepository.Draft => ({
  id: Domain.DraftId.make(id),
  calendar: Domain.CalendarId.make(1),
  title,
  span: { start: at(start), end: at(end) },
  allDay: false,
  location: Option.some("Brno"),
  notes: Option.none(),
  showAs: Option.some("busy"),
  refusal: Option.none()
})

const morning = draft("00000000-0000-4000-8000-000000000001", "Morning", "2026-11-18T08:00:00Z", "2026-11-18T09:00:00Z")
const noon = draft("00000000-0000-4000-8000-000000000002", "Noon", "2026-11-18T11:00:00Z", "2026-11-18T12:00:00Z")

const save = (saved: DraftRepository.Draft) =>
  Effect.gen(function* () {
    const drafts = yield* DraftRepository.DraftRepository
    const writes = yield* Global.Writes
    yield* writes.run(
      "calendar.draft.created",
      Effect.as(drafts.save(saved, "2026-11-17T10:00:00Z"), {
        result: undefined,
        subject: `draft/${saved.id}`,
        before: Option.none(),
        after: Option.none()
      })
    )
  })

layer(Layer.provideMerge(DraftRepository.DraftRepository.layer, Testing.layer([tables])))("DraftRepository", (test) => {
  test.effect("reads a draft it saved", () =>
    Effect.gen(function* () {
      yield* save(morning)
      const found = yield* (yield* DraftRepository.DraftRepository).byId(morning.id)
      assert.deepStrictEqual(found, Option.some(morning))
    })
  )

  test.effect("finds only the drafts that overlap the span", () =>
    Effect.gen(function* () {
      yield* save(noon)
      const found = yield* (yield* DraftRepository.DraftRepository).inSpan({
        start: at("2026-11-18T10:30:00Z"),
        end: at("2026-11-18T11:30:00Z")
      })
      assert.deepStrictEqual(
        Arr.map(found, (each) => each.title),
        ["Noon"]
      )
    })
  )
})
