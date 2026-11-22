import { assert, describe, layer } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Calendar from "@ras/calendar"
import * as Time from "@ras/kernel/Time"
import * as Suite from "../src/Suite.ts"

const personal = Calendar.CalendarId.make(101)
const workCopy = Calendar.CalendarId.make(102)
const work = Calendar.CalendarId.make(201)

const WorkHours = Schema.Struct({
  month: Schema.String,
  categories: Schema.Array(Schema.Struct({ category: Schema.String, events: Schema.Number }))
})

const day = (days: number) => Effect.map(DateTime.now, (now) => Time.addDays(Time.pragueDateOf(now), days))
const at = (date: Time.PragueDate, clock: string) => Time.PragueLocal.make(`${date}T${clock}`)

/** The sample's events of the fortnight it invents around today. */
const fortnight = Effect.gen(function* () {
  const client = yield* Suite.owner
  const from = yield* day(0)
  const to = yield* day(14)
  return yield* client.calendar.events({ query: { from: at(from, "00:00"), to: at(to, "00:00") } })
})

const sampleEvent = (title: string, calendar: Calendar.CalendarId) =>
  Effect.map(fortnight, (events) => events.find((event) => event.title === title && event.calendar === calendar)!)

/** Runs `effect` with a calendar turned off, and turns it on again whatever happens. */
const withCalendarOff = <A, E, R>(id: Calendar.CalendarId, effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const client = yield* Suite.owner
    yield* client.calendar.changeCalendar({ params: { id }, payload: { enabled: false } })
    return yield* effect.pipe(
      Effect.ensuring(Effect.orDie(client.calendar.changeCalendar({ params: { id }, payload: { enabled: true } })))
    )
  })

describe("the calendar API", () => {
  layer(Suite.layer, { excludeTestServices: true })("of a running ras", (it) => {
    it.effect("turns a calendar off, hides it unless asked for, and turns it on again", () =>
      withCalendarOff(
        workCopy,
        Effect.gen(function* () {
          const client = yield* Suite.owner
          const shown = yield* client.calendar.calendars({ query: {} })
          assert.isFalse(shown.some((calendar) => calendar.id === workCopy))
          const all = yield* client.calendar.calendars({ query: { includeDisabled: "true" } })
          assert.deepInclude(
            all.find((calendar) => calendar.id === workCopy),
            { enabled: false }
          )
          const events = yield* fortnight
          assert.isFalse(events.some((event) => event.calendar === workCopy))
        })
      )
    )

    it.effect("serves the fortnight's events with their kinds, each once, and one event by its id", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const events = yield* fortnight
        assert.isFalse(events.some((event) => event.kind === "copy"))
        assert.includeMembers(
          events.map((event) => event.title),
          ["Standup", "Lunch", "Dentist", "Gym", "Quarterly review", "Holiday"]
        )
        assert.deepInclude(
          events.find((event) => event.title === "Holiday"),
          { allDay: true, showAs: "free" }
        )
        assert.deepInclude(
          events.find((event) => event.title === "Quarterly review"),
          {
            kind: "invitation",
            rsvp: "needsAction"
          }
        )

        const dentist = yield* sampleEvent("Dentist", personal)
        const found = yield* client.calendar.event({ params: { id: dentist.id } })
        assert.deepInclude(found, { title: "Dentist", start: dentist.start, end: dentist.end })
      })
    )

    it.effect("answers 404 for an event that does not exist", () =>
      Effect.gen(function* () {
        const { url } = yield* Suite.Server
        const id = `${personal}.${(yield* day(0)).replaceAll("-", "")}.missing`
        const response = yield* HttpClientRequest.get(new URL(`/calendar/events/${id}`, url)).pipe(
          HttpClientRequest.setHeader("cookie", yield* Suite.sessionCookie),
          HttpClient.execute
        )
        assert.strictEqual(response.status, 404)
      })
    )

    it.effect("finds free time around today's standup and lunch", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const date = yield* day(1)
        const slots = yield* client.calendar.freeTime({
          query: { from: at(date, "08:00"), to: at(date, "14:00"), minimum: 30 }
        })
        assert.deepStrictEqual(
          slots.map((slot) => [slot.start, slot.end]),
          [
            [at(date, "08:00"), at(date, "09:00")],
            [at(date, "09:15"), at(date, "12:00")],
            [at(date, "13:00"), at(date, "14:00")]
          ]
        )
      })
    )

    it.effect("finds the clash of the dentist with the quarterly review", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const date = yield* day(2)
        const conflicts = yield* client.calendar.conflicts({
          query: { from: at(date, "00:00"), to: at(date, "23:59") }
        })
        const titles = new Set(["Dentist", "Quarterly review"])
        const clash = conflicts.find(
          (conflict) => titles.has(conflict.first.title) && titles.has(conflict.second.title)
        )
        assert.deepInclude(clash, { from: at(date, "14:30"), to: at(date, "15:00") })
      })
    )

    it.effect("sums the month's hours by category", () =>
      Effect.gen(function* () {
        const { url } = yield* Suite.Server
        const month = (yield* day(0)).slice(0, 7)
        const hours = yield* HttpClientRequest.get(new URL(`/calendar/work-hours/${month}?category=WORK`, url)).pipe(
          HttpClientRequest.setHeader("cookie", yield* Suite.sessionCookie),
          HttpClient.execute,
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.flatMap(HttpClientResponse.schemaBodyJson(WorkHours))
        )
        assert.strictEqual(hours.month, month)
        assert.isAbove(hours.categories.find((category) => category.category === "WORK")?.events ?? 0, 0)
      })
    )

    it.effect("sums the month's hours of the calendars asked for", () =>
      Effect.gen(function* () {
        const { url } = yield* Suite.Server
        const month = (yield* day(0)).slice(0, 7)
        const hours = yield* HttpClientRequest.get(
          new URL(`/calendar/work-hours/${month}?calendar=${personal}`, url)
        ).pipe(
          HttpClientRequest.setHeader("cookie", yield* Suite.sessionCookie),
          HttpClient.execute,
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.flatMap(HttpClientResponse.schemaBodyJson(WorkHours))
        )
        const categories = hours.categories.map((category) => category.category)
        assert.notInclude(categories, "WORK")
        assert.include(categories, "No category")
      })
    )

    it.effect("creates timed, all-day and repeating events in a writable calendar", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const date = yield* day(9)

        const timed = yield* client.calendar.createEvent({
          payload: { title: "Haircut", calendar: personal, start: at(date, "16:00"), location: "Main street" }
        })
        assert.deepInclude(timed, { calendar: personal, start: at(date, "16:00"), end: at(date, "17:00"), draft: null })

        const allDay = yield* client.calendar.createEvent({
          payload: { title: "Trip", calendar: personal, firstDay: date, lastDay: Time.addDays(date, 2) }
        })
        assert.isTrue(allDay.allDay)

        const repeating = yield* client.calendar.createEvent({
          payload: {
            title: "Piano",
            calendar: personal,
            start: at(date, "18:00"),
            end: at(date, "19:00"),
            repeat: { every: "week", count: 4 }
          }
        })
        assert.isTrue(repeating.recurring)
      })
    )

    it.effect("refuses an event without a calendar to choose, in a read-only calendar and in one turned off", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const start = at(yield* day(9), "08:00")
        assert.strictEqual(
          yield* Suite.refusal(client.calendar.createEvent({ payload: { title: "Where?", start } })),
          "calendar.calendar.choose"
        )
        assert.strictEqual(
          yield* Suite.refusal(client.calendar.createEvent({ payload: { title: "No", calendar: work, start } })),
          "calendar.calendar.readonly"
        )
        const off = yield* withCalendarOff(
          personal,
          Suite.refusal(client.calendar.createEvent({ payload: { title: "Off", calendar: personal, start } }))
        )
        assert.strictEqual(off, "calendar.calendar.off")
      })
    )

    it.effect("keeps a draft event in ras, shows it, and confirms it into its calendar", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const date = yield* day(10)
        const created = yield* client.calendar.createEvent({
          payload: { title: Suite.unique("Draft"), calendar: personal, start: at(date, "10:00"), draft: true }
        })
        assert.isNotNull(created.draft)

        const shown = yield* client.calendar.event({ params: { id: created.draft! } })
        assert.strictEqual(shown.title, created.title)

        const confirmed = yield* client.calendar.confirmDraft({ params: { id: created.draft! } })
        assert.deepInclude(confirmed, { title: created.title, start: at(date, "10:00"), draft: null })
      })
    )

    it.effect("changes and cancels a plain event, and refuses copies, Reclaim's events and read-only ones", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const dentist = yield* sampleEvent("Dentist", personal)
        const changed = yield* client.calendar.changeEvent({
          params: { id: dentist.id },
          payload: { location: "Clinic", notes: "Bring the card." }
        })
        assert.deepInclude(changed, { location: "Clinic", notes: "Bring the card." })

        const gym = yield* sampleEvent("Gym", personal)
        yield* client.calendar.cancelEvent({ params: { id: gym.id } })

        const copyRefusal = yield* withCalendarOff(
          work,
          Effect.flatMap(sampleEvent("Standup", workCopy), (copy) =>
            Suite.refusal(client.calendar.changeEvent({ params: { id: copy.id }, payload: { title: "x" } }))
          )
        )
        assert.strictEqual(copyRefusal, "calendar.event.copy")
        const lunch = yield* sampleEvent("Lunch", personal)
        assert.strictEqual(
          yield* Suite.refusal(client.calendar.cancelEvent({ params: { id: lunch.id } })),
          "calendar.event.reclaim"
        )
        const standup = yield* sampleEvent("Standup", work)
        assert.strictEqual(
          yield* Suite.refusal(client.calendar.changeEvent({ params: { id: standup.id }, payload: { title: "x" } })),
          "calendar.event.readonly"
        )
      })
    )

    it.effect("replies to an invitation, and refuses a reply to an event that is none", () =>
      Effect.gen(function* () {
        const client = yield* Suite.owner
        const review = yield* sampleEvent("Quarterly review", work)
        yield* client.calendar.replyToEvent({ params: { id: review.id }, payload: { reply: "tentative" } })

        const dentist = yield* sampleEvent("Dentist", personal)
        assert.strictEqual(
          yield* Suite.refusal(
            client.calendar.replyToEvent({ params: { id: dentist.id }, payload: { reply: "accept" } })
          ),
          "calendar.event.not-invitation"
        )
      })
    )
  })
})
