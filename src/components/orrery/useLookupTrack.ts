import { useCallback, useEffect, useMemo, useRef } from 'react'

import { useLookupSpan, useSettledSpan } from '@/hooks/useJplLookup'
import type { LookupState, Unavailable } from '@/lib/api/jplLookup'
import { shortName } from '@/lib/orrery/asteroids'
import { lookupKey, lookupOrbit, lookupSpan, spanCovers } from '@/lib/orrery/lookupTrack'
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

export { LOOKUP_SETTLE_MS } from '@/hooks/useJplLookup'
const JD_UNIX_EPOCH = 2440587.5
const DAY_MS = 86_400_000

/** JPL stayed busy through every retry. */
const GAVE_UP = 'JPL is still busy. Try again in a minute.'

const PROBLEM: Record<Unavailable, string> = {
  'not-set-up': 'On-demand lookup isn’t available yet.',
  busy: 'JPL is busy right now. Trying again shortly.',
  failed: 'JPL didn’t answer this time.',
  'out-of-range': 'JPL positions are asked for 1900 to 2100 only.',
  'not-found': 'JPL has no object with this id.',
}

/** The card's and inspector's words for a failed answer. */
export function lookupProblem(a: LookupState<unknown> | undefined, gaveUp = false): string | null {
  if (!a || a.state === 'ok') return null
  // Five retries spent (#141 review): the visitor asks again.
  if (gaveUp) return GAVE_UP
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
  /** JPL stayed busy through every retry: the inspector offers "Try again". */
  gaveUp: boolean
  /** Ask JPL again now. */
  retry: () => void
}

interface Options {
  renderer: Pick<OrreryRenderer, 'setLookup' | 'focusOn'> | null
  simMs: number
  select: (key: SceneKey) => void
}

export function useLookupTrack({ renderer, simMs, select }: Options): LookupView {
  const shown = useLookupStore((s) => s.shown)
  const spkid = shown?.spkid ?? null
  const span = useSettledSpan(spkid ? lookupSpan(simMs) : null, spkid)
  // The search card asked for this same span (#152): drawing it costs no new request.
  // Keep drawing the last span while the next is asked for (checked per object below).
  const query = useLookupSpan(spkid, span, true)
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

  // The close approaches are keyed by designation (#216): the renderer draws a twin once.
  const designation = object?.designation ?? null
  useEffect(() => {
    renderer?.setLookup(key && fine ? { key, label, designation, fine, orbit } : null)
  }, [renderer, key, label, designation, fine, orbit])

  // "Show in orrery": once drawn where the clock is, fly there and open the inspector.
  const jd = simMs / DAY_MS + JD_UNIX_EPOCH
  const covers = fine !== null && spanCovers(fine, jd)
  const focusOnLoad = shown?.focusOnLoad ?? false
  const answered = trajectory !== null
  // The inspector opens at once (it says "asking JPL…" or why not); the camera flies once
  // the samples cover the date.
  const opened = useRef<string | null>(null)
  useEffect(() => {
    // Removed: the next show of the same object opens its inspector again (#188).
    if (!key) opened.current = null
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

  const problem =
    query.data?.state === 'unavailable' ? lookupProblem(query.data, query.gaveUp) : null
  const { refetch } = query
  const retry = useCallback(() => {
    void refetch()
  }, [refetch])
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
    gaveUp: query.gaveUp,
    retry,
  }
}
