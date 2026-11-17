import * as Module from "./Module.ts"

/** The calendar module for a sibling module's tests, which compose it with `@ras/global/testing` and `sample`. */
export const module = Module.module

/** The settings that serve the invented calendars and an Outlook that writes nowhere. */
export const sample = { RAS_SAMPLE: "true" }

export { personal, work, workCopy } from "./reclaim/Sample.ts"
export { sampleCalls } from "./outlook/Outlook.ts"
