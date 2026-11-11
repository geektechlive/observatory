import { useEffect, useRef, useState } from 'react'

import type { DetailView } from './DetailView'

type DetailViewComponent = typeof DetailView

/**
 * Fetches the detail view's chunk once it is wanted (#203). A plain import rather than
 * React.lazy so a failed fetch can be handled: `onFail` runs (the page closes the view and
 * so re-attaches the orrery), and the next open tries again. The `DetailView` import above
 * is type-only, so nothing of the view reaches the page's own chunk.
 */
export function useDetailViewModule(
  wanted: boolean,
  onFail: () => void,
  importer: () => Promise<{ DetailView: DetailViewComponent }> = () => import('./DetailView'),
): DetailViewComponent | null {
  const [component, setComponent] = useState<DetailViewComponent | null>(null)
  const fail = useRef(onFail)
  useEffect(() => {
    fail.current = onFail
  })
  useEffect(() => {
    if (!wanted || component) return
    let cancelled = false
    importer().then(
      (m) => {
        if (!cancelled) setComponent(() => m.DetailView)
      },
      (error: unknown) => {
        if (cancelled) return
        console.warn('[orrery] The model view could not load:', error)
        fail.current()
      },
    )
    return () => {
      cancelled = true
    }
    // `importer` is a stable default in the page; tests pass a fixed function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, component])
  return component
}
