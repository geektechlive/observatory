import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { fetchLookup, fetchTrajectorySpan, type LookupState } from '@/lib/api/jplLookup'
import { evaluateSource } from '@/lib/health'
import type { LookupSpan } from '@/lib/orrery/lookupTrack'
import type { TrajectoryResponse } from '@/schemas/jplLookup'
import { useUiStore } from '@/store/ui'

// On-demand JPL lookup for the orrery search (#100). Each answer is a state, never an
// error, so react-query never retries: a busy JPL is told to the visitor, not hammered.

const HOUR_MS = 3_600_000

/**
 * Report a lookup answer's health like every polled source (#148): an answer graded by its
 * contract, a failure as an error. Busy, not set up, not found and out of range are answers
 * about the request, not faults in the feed, so they report nothing.
 */
export function useLookupHealth(
  name: 'jpl-lookup' | 'jpl-trajectory',
  answer: LookupState<unknown> | undefined,
): void {
  useEffect(() => {
    if (!answer) return
    const { setSourceHealth } = useUiStore.getState()
    if (answer.state === 'ok') {
      setSourceHealth(
        name,
        evaluateSource(name, answer.data, { degraded: false, dataAgeSeconds: null }),
      )
    } else if (answer.reason === 'failed') {
      setSourceHealth(name, 'error')
    }
  }, [name, answer])
}

/** What JPL's Small-Body Database says about `q`; idle while `q` is null. */
export function useJplLookup(q: string | null) {
  const query = useQuery({
    queryKey: ['jpl-lookup', q],
    queryFn: () => fetchLookup(q ?? ''),
    enabled: q !== null,
    staleTime: HOUR_MS,
    retry: false,
  })
  useLookupHealth('jpl-lookup', query.data)
  return query
}

/**
 * A busy queue or a 429 is asked again after its Retry-After, kept in these bounds, s:
 * room for the 61 s past a replayed negative entry (#141). Without one, after 15 s.
 */
const RETRY_MIN_S = 5
const RETRY_MAX_S = 120
const RETRY_DEFAULT_S = 15

/** How long the clock must rest in a new span before it is asked for, ms. */
export const LOOKUP_SETTLE_MS = 1200

interface Requested {
  spkid: string
  span: LookupSpan
}

/**
 * The span to ask for: the clock's own at once for a new object, else once the clock has
 * rested in a new span for LOOKUP_SETTLE_MS, so a scrub across years sends one request,
 * not one per span it passes. The orrery and the search card both use it (#152 review).
 * Keyed on strings, so a once-a-second render doesn't restart the wait.
 */
export function useSettledSpan(wanted: LookupSpan | null, spkid: string | null): LookupSpan | null {
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

/**
 * A busy lookup is asked again this many times at most; then it waits for the visitor's
 * "Try again", so an open card or inspector never polls a busy JPL for as long as it stays
 * open (#141 review).
 */
export const LOOKUP_MAX_RETRIES = 5

/**
 * When to ask JPL again after an answer, ms: only a busy one (503 or 429), and only while
 * `answers` (those received for this span so far) leaves retries in hand.
 */
export function lookupRetryMs(a: LookupState<unknown> | undefined, answers = 1): number | false {
  if (a?.state !== 'unavailable' || a.reason !== 'busy') return false
  if (answers > LOOKUP_MAX_RETRIES) return false
  return Math.min(RETRY_MAX_S, Math.max(RETRY_MIN_S, a.retryAfterS ?? RETRY_DEFAULT_S)) * 1000
}

/** The retries are spent and JPL is still busy: the visitor may try again. */
export function lookupGaveUp(a: LookupState<unknown> | undefined, answers: number): boolean {
  return a?.state === 'unavailable' && a.reason === 'busy' && lookupRetryMs(a, answers) === false
}

/**
 * A close pass's dense span (#215, lookupTrack.ts's `lookupClosestSpan`), idle while either
 * is null. Asked once: never retried, never refetched, nothing kept from another span or
 * object, and no health report, so a busy or failed answer changes nothing on screen (the
 * 2-day samples keep drawing). It still goes through the JPL queue and its daily budget.
 */
export function useLookupClosest(spkid: string | null, span: LookupSpan | null) {
  return useQuery({
    queryKey: ['jpl-lookup-closest', spkid, span?.start, span?.end, span?.step],
    queryFn: () =>
      fetchTrajectorySpan(`sb:${spkid ?? ''}`, span ?? { start: '', end: '', step: '' }),
    enabled: spkid !== null && span !== null,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

/**
 * Horizons samples for a looked-up object over a span (lookupTrack.ts's `lookupSpan`),
 * idle while either is null. The search card and the orrery ask for the same span through
 * this one query, so a lookup shown in the orrery is one JPL request, not two (#152).
 * `keepPrevious`: keep the last span's answer while the next is asked for (the orrery).
 */
export function useLookupSpan(spkid: string | null, span: LookupSpan | null, keepPrevious = false) {
  const queryKey = ['jpl-lookup-track', spkid, span?.start, span?.end]
  const client = useQueryClient()
  const query = useQuery({
    queryKey,
    queryFn: () =>
      fetchTrajectorySpan(`sb:${spkid ?? ''}`, span ?? { start: '', end: '', step: '' }),
    enabled: spkid !== null && span !== null,
    staleTime: HOUR_MS,
    retry: false,
    ...(keepPrevious
      ? { placeholderData: (previous?: LookupState<TrajectoryResponse>) => previous }
      : {}),
    // A busy queue or a rate limit says when to come back, five times at most (a fresh
    // span is a fresh query); nothing else is retried. Every answer here is data, so
    // `dataUpdateCount` counts them.
    refetchInterval: (q) => lookupRetryMs(q.state.data, q.state.dataUpdateCount),
  })
  useLookupHealth('jpl-trajectory', query.data)
  // Answers this span has had; the result itself doesn't carry the count.
  const answers = client.getQueryState(queryKey)?.dataUpdateCount ?? 0
  return { ...query, gaveUp: lookupGaveUp(query.data, answers) }
}
