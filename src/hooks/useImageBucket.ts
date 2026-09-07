import { useEffect, useState } from 'react'

const TICK_MS = 60_000

/**
 * Cache-busting bucket for slow-refreshing imagery (solar disc frames, etc).
 * Returns a number that increments every `refreshMs`, so callers can append
 * it as a query param to force a fresh fetch without re-requesting on every
 * render. Re-evaluated every 60s; paused while the tab is hidden.
 */
export function useImageBucket(refreshMs: number): number {
  const [bucket, setBucket] = useState(() => Math.floor(Date.now() / refreshMs))

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      setBucket(Math.floor(Date.now() / refreshMs))
    }, TICK_MS)
    return () => {
      clearInterval(id)
    }
  }, [refreshMs])

  return bucket
}
