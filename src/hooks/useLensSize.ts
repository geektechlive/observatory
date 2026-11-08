import { type RefObject, useLayoutEffect, useState } from 'react'

/** The globe's ring adds this much on each side (BEZEL_WIDTH in GlobeBezel). */
const BEZEL_PX = 38
/** The prototype: the instrument fills the lens up to 72% of the viewport height or 760px. */
const MAX_INSTRUMENT_PX = 760
const MAX_VIEWPORT_SHARE = 0.72
/** Expanded (#89), the lens fills the screen: only its top and bottom margin are kept. */
const EXPANDED_MARGIN_PX = 48
const MIN_GLOBE_PX = 240
const DEFAULT_GLOBE_PX = 460

/** Globe diameter that fits a lens of this width in this viewport. */
export function globeSizeFor(lensWidth: number, viewportHeight: number, expanded = false): number {
  const instrument = expanded
    ? Math.min(lensWidth, viewportHeight - EXPANDED_MARGIN_PX)
    : Math.min(lensWidth, viewportHeight * MAX_VIEWPORT_SHARE, MAX_INSTRUMENT_PX)
  return Math.max(MIN_GLOBE_PX, Math.floor(instrument - 2 * BEZEL_PX))
}

/** The lens's width inside its padding (the expanded lens has some; the normal one none). */
function contentWidth(el: HTMLElement): number {
  const style = window.getComputedStyle(el)
  const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
  return el.clientWidth - padding
}

/**
 * How big the globe can be (#63): the lens element's width, capped by the viewport
 * height, so the instrument dominates the page without pushing the plates off screen.
 * Expanded (#89), the cap is the screen itself.
 */
export function useLensSize(
  ref: RefObject<HTMLElement | null>,
  expanded = false,
  /** Re-measure when this changes: the lens unmounts while the orrery has the page (#91). */
  remountKey?: unknown,
): number {
  const [size, setSize] = useState(DEFAULT_GLOBE_PX)
  // A layout effect: it measures and sets the size before the first paint (#169). As a
  // passive effect it ran after paint, so the globe drew at DEFAULT_GLOBE_PX and then
  // grew, pushing the plates and the footer down by 200 px or more.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const update = () => {
      setSize(globeSizeFor(contentWidth(el), window.innerHeight, expanded))
    }
    const observer = new ResizeObserver(update)
    observer.observe(el)
    window.addEventListener('resize', update)
    update()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [ref, expanded, remountKey])
  return size
}
