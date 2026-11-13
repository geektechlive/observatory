import { useMemo, useSyncExternalStore } from 'react'

import { parseSkyLink, type SkyLink } from '@/lib/sky/skyLink'

export interface SkyLinkState extends SkyLink {
  /** The orrery's button opened this history entry (orrery/skyViewLink.ts), not a pasted link. */
  fromOrrery: boolean
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => {
    window.removeEventListener('hashchange', onChange)
  }
}

const OPENED_BY_ORRERY = '\u0000orrery'

function fromOrrery(): boolean {
  const state: unknown = window.history.state
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { skyFrom?: unknown }).skyFrom === 'orrery'
  )
}

/** The address, and whether the orrery wrote it: one string, so the store snapshot is stable. */
const read = () => window.location.hash + (fromOrrery() ? OPENED_BY_ORRERY : '')

/**
 * The sky view's link (`#sky?target=…&t=…`, lib/sky/skyLink.ts), read from the address.
 * The address is the state: a Tonight row, the orrery's inspector and a pasted link all
 * open the view by writing it, and useHashView keeps these two params while on Sky.
 */
export function useSkyLink(): SkyLinkState {
  const raw = useSyncExternalStore(subscribe, read, () => '')
  return useMemo(() => {
    const opened = raw.endsWith(OPENED_BY_ORRERY)
    const hash = opened ? raw.slice(0, -OPENED_BY_ORRERY.length) : raw
    return { ...parseSkyLink(hash), fromOrrery: opened }
  }, [raw])
}
