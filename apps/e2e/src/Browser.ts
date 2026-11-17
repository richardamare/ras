import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Playwright from "playwright"

// Playwright's locators and pages with every action as an effect. A rejected action dies, which fails the test.

export class Locator {
  readonly raw: Playwright.Locator
  constructor(raw: Playwright.Locator) {
    this.raw = raw
  }

  getByRole(...args: Parameters<Playwright.Locator["getByRole"]>) {
    return new Locator(this.raw.getByRole(...args))
  }
  getByText(...args: Parameters<Playwright.Locator["getByText"]>) {
    return new Locator(this.raw.getByText(...args))
  }
  getByLabel(...args: Parameters<Playwright.Locator["getByLabel"]>) {
    return new Locator(this.raw.getByLabel(...args))
  }
  locator(selector: string) {
    return new Locator(this.raw.locator(selector))
  }
  filter(options: { readonly has?: Locator; readonly hasText?: string | RegExp }) {
    return new Locator(
      this.raw.filter({
        ...(options.has === undefined ? {} : { has: options.has.raw }),
        ...(options.hasText === undefined ? {} : { hasText: options.hasText })
      })
    )
  }
  first() {
    return new Locator(this.raw.first())
  }
  last() {
    return new Locator(this.raw.last())
  }

  click() {
    return Effect.promise(() => this.raw.click())
  }
  fill(value: string) {
    return Effect.promise(() => this.raw.fill(value))
  }
  waitFor(options?: Parameters<Playwright.Locator["waitFor"]>[0]) {
    return Effect.promise(() => this.raw.waitFor(options))
  }
  /** Drags this element onto `target` with the browser's own drag and drop. */
  dragTo(target: Locator) {
    return Effect.promise(() => this.raw.dragTo(target.raw))
  }
  get count() {
    return Effect.promise(() => this.raw.count())
  }
}

export class Page {
  readonly raw: Playwright.Page
  constructor(raw: Playwright.Page) {
    this.raw = raw
  }

  getByRole(...args: Parameters<Playwright.Page["getByRole"]>) {
    return new Locator(this.raw.getByRole(...args))
  }
  getByText(...args: Parameters<Playwright.Page["getByText"]>) {
    return new Locator(this.raw.getByText(...args))
  }
  getByLabel(...args: Parameters<Playwright.Page["getByLabel"]>) {
    return new Locator(this.raw.getByLabel(...args))
  }
  locator(selector: string) {
    return new Locator(this.raw.locator(selector))
  }

  /** Opens `path` on the page's origin, or a whole URL. */
  goto(path: string) {
    return Effect.asVoid(Effect.promise(() => this.raw.goto(path)))
  }
  waitForURL(matches: (url: URL) => boolean) {
    return Effect.promise(() => this.raw.waitForURL(matches))
  }
  get url() {
    return Effect.sync(() => new URL(this.raw.url()))
  }
  /** Posts JSON from the page's context, which keeps the cookies the answer sets; answers the status. */
  post(path: string, data: object, headers: Readonly<Record<string, string>>) {
    return Effect.map(
      Effect.promise(() => this.raw.request.post(path, { data, headers: { ...headers } })),
      (response) => response.status()
    )
  }
}

/** Headless Chromium, closed with the layer. */
export class Browser extends Context.Service<Browser, Playwright.Browser>()("@ras/e2e/Browser") {
  static readonly layer = Layer.effect(
    Browser,
    Effect.acquireRelease(
      Effect.promise(() => Playwright.chromium.launch()),
      (browser) => Effect.promise(() => browser.close())
    )
  )
}

/**
 * A page of its own browser context on `origin`, in English, closed with the scope. An action that waits longer than
 * ten seconds fails, so the failure names the step.
 */
export const open = (origin: string) =>
  Effect.gen(function* () {
    const browser = yield* Browser
    const context = yield* Effect.acquireRelease(
      Effect.promise(() => browser.newContext({ baseURL: origin, locale: "en-US" })),
      (opened) => Effect.promise(() => opened.close())
    )
    context.setDefaultTimeout(10_000)
    yield* Effect.promise(() => context.addInitScript(() => window.localStorage.setItem("lang", "en")))
    return new Page(yield* Effect.promise(() => context.newPage()))
  })
