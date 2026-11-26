export interface Point {
  readonly x: number
  readonly y: number
}

export type Outcome = "click" | "drag" | "cancel"

const threshold = 4

/** Follows the pointer until it lifts: a press that never moved past the threshold is a click; Escape cancels. */
export const trackPointer = (
  origin: Point,
  handlers: { readonly onDrag: (at: Point) => void; readonly onEnd: (at: Point, outcome: Outcome) => void }
) => {
  let dragged = false
  let last = origin

  const finish = (outcome: Outcome) => {
    window.removeEventListener("pointermove", move)
    window.removeEventListener("pointerup", up)
    window.removeEventListener("pointercancel", cancel)
    window.removeEventListener("keydown", escape)
    handlers.onEnd(last, outcome)
  }
  const move = (event: PointerEvent) => {
    last = { x: event.clientX, y: event.clientY }
    if (!dragged && Math.hypot(last.x - origin.x, last.y - origin.y) < threshold) return
    dragged = true
    handlers.onDrag(last)
  }
  const up = (event: PointerEvent) => {
    last = { x: event.clientX, y: event.clientY }
    finish(dragged ? "drag" : "click")
  }
  const cancel = () => finish("cancel")
  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape") finish("cancel")
  }

  window.addEventListener("pointermove", move)
  window.addEventListener("pointerup", up)
  window.addEventListener("pointercancel", cancel)
  window.addEventListener("keydown", escape)
}
