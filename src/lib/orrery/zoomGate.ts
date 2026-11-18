/**
 * Zoom-to-enter (#261): zooming in past the orrery's closest approach to a craft opens its
 * fly-in, and zooming out past the fly-in's start returns to the orrery. A trackpad keeps
 * sending wheel events for a second after the fingers lift, so a crossing needs a gesture
 * that STARTS at the limit: the gesture that carried the camera there never crosses, and
 * the rest of a crossing gesture is swallowed so it can't steer the next view.
 */

/** Wheel events closer together than this are one gesture, ms. */
export const GESTURE_GAP_MS = 300
/** How far a push past the limit must go to cross, px of wheel. */
export const PUSH_PX = 400
/**
 * A mouse wheel's notches can come slower than one gesture: while the camera stays at the
 * limit, a push carries over pauses up to this long, ms.
 */
export const NOTCH_WINDOW_MS = 1500
/** OrbitControls' own wheel scaling: line and page modes, and a trackpad pinch (ctrl). */
const LINE_PX = 16
const PAGE_PX = 100
const PINCH_SCALE = 10

/** A wheel event's vertical delta in px, scaled as OrbitControls scales its zoom. */
export function wheelPx(e: {
  readonly deltaY: number
  readonly deltaMode: number
  readonly ctrlKey: boolean
}): number {
  const mode = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? PAGE_PX : 1
  return e.deltaY * mode * (e.ctrlKey ? PINCH_SCALE : 1)
}

/** Counts one direction's push past a zoom limit. `in` is a negative deltaY (closer). */
export class ZoomGate {
  private lastMs = Number.NEGATIVE_INFINITY
  private armed = false
  private push = 0
  private readonly direction: 'in' | 'out'

  constructor(direction: 'in' | 'out') {
    this.direction = direction
  }

  /**
   * One wheel event: its delta (px), whether the camera was at the limit before it, and its
   * time. True once, on the event that completes the push.
   */
  feed(deltaPx: number, atLimit: boolean, nowMs: number): boolean {
    const gap = nowMs - this.lastMs
    this.lastMs = nowMs
    if (gap > GESTURE_GAP_MS) {
      // A new gesture. Slow notches at the limit keep their push; anything else starts over.
      if (!(this.armed && atLimit && gap <= NOTCH_WINDOW_MS)) this.push = 0
      this.armed = atLimit
    }
    if (!atLimit) {
      this.armed = false
      this.push = 0
      return false
    }
    const along = this.direction === 'in' ? -deltaPx : deltaPx
    if (!this.armed || along <= 0) return false
    this.push += along
    if (this.push < PUSH_PX) return false
    this.armed = false
    this.push = 0
    return true
  }
}

/** How far two fingers must spread past the limit to cross, px. A phone is small. */
export const PINCH_PUSH_PX = 120

/**
 * The touch-screen pinch's version of ZoomGate. A pinch has a clear start (the second finger
 * lands) and end (a finger lifts), so it needs no timing: only a pinch that starts with the
 * camera at the limit can cross, and the one that carried it there never does.
 */
export class PinchGate {
  private armed = false
  private start0 = 0

  /** Two fingers are down, this far apart; was the camera at the limit already? */
  start(spreadPx: number, atLimit: boolean): void {
    this.armed = atLimit
    this.start0 = spreadPx
  }

  /** The fingers moved; true once, when they have spread far enough past the limit. */
  move(spreadPx: number, atLimit: boolean): boolean {
    if (!this.armed) return false
    if (!atLimit) {
      this.armed = false
      return false
    }
    if (spreadPx - this.start0 < PINCH_PUSH_PX) return false
    this.armed = false
    return true
  }

  /** A finger lifted. */
  end(): void {
    this.armed = false
  }
}

/**
 * Stop every wheel event at `target` (capture) until none has arrived for a gesture gap,
 * so a crossing gesture's momentum never reaches the view it opened. Returns a cancel.
 */
export function swallowWheelUntilQuiet(target: Window): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = () => {
    clearTimeout(timer)
    target.removeEventListener('wheel', onWheel, true)
  }
  const onWheel = (e: Event) => {
    e.stopPropagation()
    e.preventDefault()
    clearTimeout(timer)
    timer = setTimeout(stop, GESTURE_GAP_MS)
  }
  target.addEventListener('wheel', onWheel, { capture: true, passive: false })
  timer = setTimeout(stop, GESTURE_GAP_MS)
  return stop
}
