import { useCallback, useEffect, useRef, useState } from 'react'

/** Sub-pixel scroll positions: closer than this to the end counts as at the end. */
const END_TOLERANCE_PX = 1

/**
 * Whether a sideways-scrolling element has more to show to the right (#227). True while
 * its content is wider than the box and it is not scrolled to the end. `contentKey`
 * changes when the content swaps (loading to table), so the flag is measured again.
 */
export function useScrollMore<T extends HTMLElement>(contentKey: unknown) {
  const ref = useRef<T>(null)
  const [hasMore, setHasMore] = useState(false)

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    setHasMore(el.scrollWidth - el.clientWidth - el.scrollLeft > END_TOLERANCE_PX)
  }, [])

  useEffect(() => {
    measure()
  }, [measure, contentKey])

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    for (const child of Array.from(el.children)) observer.observe(child)
    return () => {
      observer.disconnect()
    }
  }, [measure, contentKey])

  return [ref, hasMore, measure] as const
}
