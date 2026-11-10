/** The most device pixels per CSS pixel the orrery draws (a 3x phone costs 2.25x the fill of 2x). */
const MAX_PIXEL_RATIO = 2

/** The drawing buffer's pixel ratio for this window: devicePixelRatio, capped (#200). */
export function cappedPixelRatio(win: Pick<Window, 'devicePixelRatio'>): number {
  const ratio = win.devicePixelRatio
  return ratio > 0 ? Math.min(ratio, MAX_PIXEL_RATIO) : 1
}

/**
 * Calls `onChange` with the new capped ratio whenever the window's devicePixelRatio
 * changes (moved to another display, browser zoom). A `(resolution: Ndppx)` query
 * changes only once, so a fresh one is made after every change. Returns the cleanup.
 */
export function watchPixelRatio(win: Window, onChange: (ratio: number) => void): () => void {
  if (typeof win.matchMedia !== 'function') return () => undefined
  let stop: () => void = () => undefined
  const arm = () => {
    const query = win.matchMedia(`(resolution: ${String(win.devicePixelRatio)}dppx)`)
    const listener = () => {
      query.removeEventListener('change', listener)
      onChange(cappedPixelRatio(win))
      arm()
    }
    query.addEventListener('change', listener)
    stop = () => {
      query.removeEventListener('change', listener)
    }
  }
  arm()
  return () => {
    stop()
  }
}
