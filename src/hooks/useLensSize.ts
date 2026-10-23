import { type RefObject, useEffect, useState } from 'react'

/** The globe's ring adds this much on each side (BEZEL_WIDTH in GlobeBezel). */
const BEZEL_PX = 38
/** The prototype: the instrument fills the lens up to 72% of the viewport height or 760px. */
const MAX_INSTRUMENT_PX = 760
const MAX_VIEWPORT_SHARE = 0.72
const MIN_GLOBE_PX = 240
const DEFAULT_GLOBE_PX = 460

/** Globe diameter that fits a lens of this width in this viewport. */
export function globeSizeFor(lensWidth: number, viewportHeight: number): number {
  const instrument = Math.min(lensWidth, viewportHeight * MAX_VIEWPORT_SHARE, MAX_INSTRUMENT_PX)
  return Math.max(MIN_GLOBE_PX, Math.floor(instrument - 2 * BEZEL_PX))
}

/**
 * How big the globe can be (#63): the lens element's width, capped by the viewport
 * height, so the instrument dominates the page without pushing the plates off screen.
 */
export function useLensSize(ref: RefObject<HTMLElement | null>): number {
  const [size, setSize] = useState(DEFAULT_GLOBE_PX)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const update = () => {
      setSize(globeSizeFor(el.clientWidth, window.innerHeight))
    }
    const observer = new ResizeObserver(update)
    observer.observe(el)
    window.addEventListener('resize', update)
    update()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [ref])
  return size
}
