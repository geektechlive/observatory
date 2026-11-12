import { SOURCES } from '@/lib/health'
import { stateAt } from '@/lib/orrery/ephemeris'
import { heliocentric } from '@/lib/orrery/kepler'
import {
  type LookupResponse,
  readLookupResponse,
  type TrajectoryResponse,
  TrajectoryResponseSchema,
} from '@/schemas/jplLookup'

import { apiFetch } from './client'

// The orrery search's on-demand lookup (#100): /api/lookup and /api/trajectory, which
// reach JPL through the jpl-queue Durable Object. A failure is an answer the search box
// shows ("not set up", "busy"), never a thrown error.

export type Unavailable = 'not-set-up' | 'busy' | 'failed' | 'out-of-range' | 'not-found'

export type LookupState<T> =
  | { state: 'ok'; data: T }
  | {
      state: 'unavailable'
      reason: Unavailable
      /** A busy queue's Retry-After, seconds (#145: the card says how long to wait). */
      retryAfterS?: number
    }

const NOT_FOUND = 404
const TOO_MANY = 429
/**
 * A negative entry (`X-Cache: NEG`, functions/api/_cache.ts) is replayed for 60 s, so
 * asking sooner gets the same answer: wait this long at least (#141).
 */
const NEG_WAIT_S = 61

/**
 * How long to wait, s, or null when nothing says: the queue's or the rate limit's
 * Retry-After, and past a replayed negative entry's 60 s.
 */
function retryAfter(res: Response): number | null {
  const s = Number(res.headers.get('Retry-After'))
  const said = Number.isFinite(s) && s > 0 ? s : null
  if (res.headers.get('X-Cache') !== 'NEG') return said
  return Math.max(said ?? 0, NEG_WAIT_S)
}

async function getLookupJson<T>(
  url: string,
  source: 'jpl-lookup' | 'jpl-trajectory',
  read: (raw: unknown) => T | null,
): Promise<LookupState<T>> {
  let res: Response
  try {
    res = await apiFetch(url)
  } catch {
    return { state: 'unavailable', reason: 'failed' }
  }
  if (!res.ok) {
    if (res.headers.get('X-Not-Configured') !== null) {
      return { state: 'unavailable', reason: 'not-set-up' }
    }
    if (res.status === NOT_FOUND) return { state: 'unavailable', reason: 'not-found' }
    // 503 is the queue refusing or JPL not answering, 429 the site's /api rate limit (the
    // Functions' or the zone's, #141): worth another try once they say.
    if (res.status !== 503 && res.status !== TOO_MANY) {
      return { state: 'unavailable', reason: 'failed' }
    }
    const wait = retryAfter(res)
    return wait === null
      ? { state: 'unavailable', reason: 'busy' }
      : { state: 'unavailable', reason: 'busy', retryAfterS: wait }
  }
  const data = read(await res.json().catch(() => null))
  // Parsed but empty (no samples, an empty list) is drift, not an answer (#148, ADR 0004).
  if (data === null || !SOURCES[source].required(data)) {
    return { state: 'unavailable', reason: 'failed' }
  }
  return { state: 'ok', data }
}

const readTrajectory = (raw: unknown): TrajectoryResponse | null => {
  const parsed = TrajectoryResponseSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export function fetchLookup(q: string): Promise<LookupState<LookupResponse>> {
  return getLookupJson(`/api/lookup?q=${encodeURIComponent(q)}`, 'jpl-lookup', readLookupResponse)
}

/**
 * Horizons samples for a span (#145: the two years the orrery draws a looked-up object
 * from; since #152 the search card reads its position from the same span).
 */
export function fetchTrajectorySpan(
  id: string,
  span: { start: string; end: string; step: string },
): Promise<LookupState<TrajectoryResponse>> {
  const params = new URLSearchParams({ id, start: span.start, end: span.end, step: span.step })
  return getLookupJson(`/api/trajectory?${params.toString()}`, 'jpl-trajectory', readTrajectory)
}

const AU_KM = 149_597_870.7
const DAY_S = 86_400

export interface TrajectoryFacts {
  /** The date the facts are for (Julian date, TDB). */
  sampleJd: number
  sunAu: number
  /** From Earth placed with JPL's approximate elements, so approximate itself. */
  earthAu: number
  speedKmS: number
}

/**
 * Distance from the Sun and Earth and speed at `jd`, Hermite between the samples as the
 * orrery draws it (#152: the card reads the orrery's 2-day span); null outside them.
 */
export function trajectoryFacts(t: TrajectoryResponse, jd: number): TrajectoryFacts | null {
  const fine = t.fine
  const s = fine ? stateAt({ fine, coarse: null }, jd) : null
  if (!s) return null
  const { x, y, z } = s.position
  const v = s.velocity
  const earth = heliocentric('Earth', jd)
  return {
    sampleJd: jd,
    sunAu: Math.hypot(x, y, z),
    earthAu: Math.hypot(x - earth.x, y - earth.y, z - earth.z),
    speedKmS: (Math.hypot(v.x, v.y, v.z) * AU_KM) / DAY_S,
  }
}
