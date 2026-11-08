import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'

import { fetchTrajectorySpan, type LookupState, type Unavailable } from '@/lib/api/jplLookup'
import { shortName } from '@/lib/orrery/asteroids'
import {
  lookupKey,
  lookupOrbit,
  type LookupSpan,
  lookupSpan,
  spanCovers,
} from '@/lib/orrery/lookupTrack'
import type { LookupObject, TrajectoryResponse } from '@/schemas/jplLookup'

import type { CatalogItem } from './catalog'
import { useLookupStore } from './lookupStore'
import type { OrreryRenderer, SceneKey } from './three/OrreryRenderer'

/**
 * The object looked up at JPL and shown in the orrery (#145): fetches two years of its
 * Horizons samples around the sim date through the JPL queue, hands them to the renderer,
 * and flies to it once drawn when "Show in orrery" asked. A new span is asked for only
 * once the clock has settled outside the old one, so a scrub across years sends one
 * request, not one per span it passes.
 */

/** How long the clock must rest in a new span before it is asked for, ms. */
export const LOOKUP_SETTLE_MS = 1200
const HOUR_MS = 3_600_000
/** A busy queue is asked again after its Retry-After, kept in these bounds, s. */
const RETRY_MIN_S = 5
const RETRY_MAX_S = 60
const JD_UNIX_EPOCH = 2440587.5
const DAY_MS = 86_400_000

const PROBLEM: Record<Unavailable, string> = {
  'not-set-up': 'On-demand lookup isn’t available yet.',
  busy: 'JPL is busy right now. Trying again shortly.',
  failed: 'JPL didn’t answer this time.',
  'out-of-range': 'JPL positions are asked for 1900 to 2100 only.',
  'not-found': 'JPL has no object with this id.',
}

/** The card's and inspector's words for a failed answer. */
export function lookupProblem(a: LookupState<unknown> | undefined): string | null {
  if (!a || a.state === 'ok') return null
  if (a.reason === 'busy' && a.retryAfterS !== undefined) {
    return `JPL is busy right now. Trying again in ${String(Math.round(a.retryAfterS))} s.`
  }
  return PROBLEM[a.reason]
}

export interface LookupView {
  /** The scene key while an object is shown, else null. */
  key: SceneKey | null
  /** Its label in the scene: JPL's name shortened as the close approaches' are ("Apophis"). */
  label: string
  object: LookupObject | null
  /** Horizons' answer for the span drawn now, once it has arrived. */
  trajectory: TrajectoryResponse | null
  /** Its search entry, with whether its samples cover the date. */
  item: CatalogItem | null
  loading: boolean
  /** A failed answer in plain words, or null. */
  problem: string | null
  /** The answer said no for good (not found, not set up): a link to it can let go. */
  failed: boolean
}

interface Options {
  renderer: Pick<OrreryRenderer, 'setLookup' | 'focusOn'> | null
  simMs: number
  select: (key: SceneKey) => void
}

interface Requested {
  spkid: string
  span: LookupSpan
}

/**
 * The span to ask for: the clock's own at once for a new object, else once the clock has
 * rested in a new span for LOOKUP_SETTLE_MS. Keyed on strings, so the page's once-a-second
 * render doesn't restart the wait.
 */
function useSettledSpan(wanted: LookupSpan | null, spkid: string | null): LookupSpan | null {
  const [requested, setRequested] = useState<Requested | null>(null)
  const current = requested?.spkid === spkid ? requested : null
  const wantKey = wanted && spkid ? JSON.stringify({ spkid, span: wanted }) : ''
  const currentKey = current ? JSON.stringify(current) : ''
  useEffect(() => {
    if (wantKey === currentKey) return
    const timer = setTimeout(
      () => {
        setRequested(wantKey ? (JSON.parse(wantKey) as Requested) : null)
      },
      currentKey ? LOOKUP_SETTLE_MS : 0,
    )
    return () => {
      clearTimeout(timer)
    }
  }, [wantKey, currentKey])
  return current?.span ?? null
}

export function useLookupTrack({ renderer, simMs, select }: Options): LookupView {
  const shown = useLookupStore((s) => s.shown)
  const spkid = shown?.spkid ?? null
  const span = useSettledSpan(spkid ? lookupSpan(simMs) : null, spkid)
  const query = useQuery({
    queryKey: ['jpl-lookup-track', spkid, span?.start, span?.end],
    queryFn: () =>
      fetchTrajectorySpan(`sb:${spkid ?? ''}`, span ?? { start: '', end: '', step: '' }),
    enabled: spkid !== null && span !== null,
    staleTime: HOUR_MS,
    retry: false,
    // Keep drawing the last span while the next is asked for (checked per object below).
    placeholderData: (previous) => previous,
    // A busy queue says when to come back; nothing else is retried.
    refetchInterval: (q) => {
      const a = q.state.data
      if (a?.state !== 'unavailable' || a.reason !== 'busy') return false
      return Math.min(RETRY_MAX_S, Math.max(RETRY_MIN_S, a.retryAfterS ?? 15)) * 1000
    },
  })
  const trajectory =
    query.data?.state === 'ok' && query.data.data.object.spkid === spkid ? query.data.data : null

  const object = shown?.object ?? trajectory?.object ?? null
  const key = spkid ? lookupKey(spkid) : null
  const label = object ? shortName(object.name) : spkid ? `SPK-ID ${spkid}` : ''
  const fine = trajectory?.fine ?? null
  const orbit = useMemo(() => {
    if (!fine) return null
    const n = Math.floor(fine.samples.length / 6)
    return lookupOrbit(fine, fine.start + ((n - 1) / 2) * fine.step)
  }, [fine])

  useEffect(() => {
    renderer?.setLookup(key && fine ? { key, label, fine, orbit } : null)
  }, [renderer, key, label, fine, orbit])

  // "Show in orrery": once drawn where the clock is, fly there and open the inspector.
  const jd = simMs / DAY_MS + JD_UNIX_EPOCH
  const covers = fine !== null && spanCovers(fine, jd)
  const focusOnLoad = shown?.focusOnLoad ?? false
  const answered = trajectory !== null
  // The inspector opens at once (it says "asking JPL…" or why not); the camera flies once
  // the samples cover the date.
  const opened = useRef<string | null>(null)
  useEffect(() => {
    if (!renderer || !key || !focusOnLoad) return
    if (opened.current !== key) {
      opened.current = key
      select(key)
      if (covers) useLookupStore.getState().focused()
      return
    }
    if (!covers) return
    useLookupStore.getState().focused()
    renderer.focusOn(key)
  }, [renderer, key, focusOnLoad, covers, select])

  const problem = query.data?.state === 'unavailable' ? lookupProblem(query.data) : null
  const failed =
    query.data?.state === 'unavailable' &&
    (query.data.reason === 'not-found' ||
      query.data.reason === 'not-set-up' ||
      query.data.reason === 'failed')
  // Stable between renders, so the page's search list is rebuilt only when it changes.
  const fullName = object?.name ?? label
  const item = useMemo<CatalogItem | null>(
    () =>
      key
        ? {
            key,
            label: fullName,
            kind: 'lookup',
            group: 'Looked up at JPL',
            available: covers,
            ...(covers ? {} : { note: answered ? 'no JPL data for this date yet' : 'asking JPL…' }),
          }
        : null,
    [key, fullName, covers, answered],
  )
  return {
    key,
    label,
    object,
    trajectory,
    item,
    loading: spkid !== null && (span === null || query.isFetching),
    problem,
    failed,
  }
}
