/**
 * What counts as a click on the orrery's canvas (#265): a press and release within a few
 * pixels. A drag turns or slides the camera, and a two-finger gesture zooms or slides, so
 * neither is a click, and no finger of a two-finger gesture is one either.
 */

/** A press that moves further than this before release is a drag, not a click. */
export const DRAG_PX = 5

export class CanvasClick {
  private readonly downs = new Map<number, { x: number; y: number }>()
  /** More than one finger was down at some point in this gesture. */
  private multi = false

  /** A press. Only a mouse's main button can click; right and middle drag the camera. */
  down(id: number, x: number, y: number, mainButton = true): void {
    if (!mainButton) return
    this.downs.set(id, { x, y })
    if (this.downs.size > 1) this.multi = true
  }

  /** Whether this release ends a click. */
  up(id: number, x: number, y: number): boolean {
    const start = this.downs.get(id)
    const multi = this.multi
    this.forget(id)
    if (!start || multi) return false
    return Math.hypot(x - start.x, y - start.y) <= DRAG_PX
  }

  cancel(id: number): void {
    this.forget(id)
  }

  private forget(id: number): void {
    this.downs.delete(id)
    if (this.downs.size === 0) this.multi = false
  }
}

export interface EscState {
  readonly key: string
  readonly defaultPrevented: boolean
  /** Focus is in a text field or the Find box, where Esc dismisses suggestions. */
  readonly inField: boolean
  readonly selected: boolean
  /** The guide takes Esc to close itself. */
  readonly guideOpen: boolean
  /** The close-up takes Esc to go back to the orrery. */
  readonly detailOpen: boolean
}

/** Esc deselects only when nothing else uses it (#265). */
export function escDeselects(s: EscState): boolean {
  return (
    s.key === 'Escape' &&
    !s.defaultPrevented &&
    !s.inField &&
    s.selected &&
    !s.guideOpen &&
    !s.detailOpen
  )
}
