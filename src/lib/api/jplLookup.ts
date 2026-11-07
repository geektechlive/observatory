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

export type Unavailable = 'not-set-up' | 'busy' | 'failed' | 'out-of-range'

export type LookupState<T> =
  { state: 'ok'; data: T } | { state: 'unavailable'; reason: Unavailable }

async function getLookupJson<T>(
  url: string,
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
    // 503 is the queue refusing or JPL not answering: worth another try shortly.
    return { state: 'unavailable', reason: res.status === 503 ? 'busy' : 'failed' }
  }
  const data = read(await res.json().catch(() => null))
  return data === null ? { state: 'unavailable', reason: 'failed' } : { state: 'ok', data }
}

const readTrajectory = (raw: unknown): TrajectoryResponse | null => {
  const parsed = TrajectoryResponseSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export function fetchLookup(q: string): Promise<LookupState<LookupResponse>> {
  return getLookupJson(`/api/lookup?q=${encodeURIComponent(q)}`, readLookupResponse)
}

const UNIX_EPOCH_JD = 2440587.5
const DAY_MS = 86_400_000
const FIRST_DAY = '1900-01-01'
const LAST_DAY = '2100-12-31'

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/**
 * The day before to the day after the date's UTC day: three daily samples. Whole days
 * keep the cache key the same for everyone looking that day. Null outside 1900–2100.
 */
export function trajectoryWindow(jd: number): { start: string; end: string } | null {
  const day = Math.floor(jd - UNIX_EPOCH_JD) * DAY_MS
  const start = isoDay(day - DAY_MS)
  const end = isoDay(day + DAY_MS)
  return start < FIRST_DAY || end > LAST_DAY ? null : { start, end }
}

export function fetchTrajectoryAround(
  id: string,
  jd: number,
): Promise<LookupState<TrajectoryResponse>> {
  const window = trajectoryWindow(jd)
  if (!window) return Promise.resolve({ state: 'unavailable', reason: 'out-of-range' })
  const params = new URLSearchParams({ id, start: window.start, end: window.end, step: '1d' })
  return getLookupJson(`/api/trajectory?${params.toString()}`, readTrajectory)
}

const AU_KM = 149_597_870.7
const DAY_S = 86_400
const STRIDE = 6

export interface TrajectoryFacts {
  /** The sample the facts are read from (Julian date, TDB). */
  sampleJd: number
  sunAu: number
  /** From Earth placed with JPL's approximate elements, so approximate itself. */
  earthAu: number
  speedKmS: number
}

/** Distance from the Sun and Earth and speed, at the sample nearest `jd`. */
export function trajectoryFacts(t: TrajectoryResponse, jd: number): TrajectoryFacts | null {
  const fine = t.fine
  if (!fine) return null
  const count = Math.floor(fine.samples.length / STRIDE)
  if (count === 0) return null
  const i = Math.min(count - 1, Math.max(0, Math.round((jd - fine.start) / fine.step)))
  const [x = 0, y = 0, z = 0, vx = 0, vy = 0, vz = 0] = fine.samples.slice(
    i * STRIDE,
    i * STRIDE + STRIDE,
  )
  const sampleJd = fine.start + i * fine.step
  const earth = heliocentric('Earth', sampleJd)
  return {
    sampleJd,
    sunAu: Math.hypot(x, y, z),
    earthAu: Math.hypot(x - earth.x, y - earth.y, z - earth.z),
    speedKmS: (Math.hypot(vx, vy, vz) * AU_KM) / DAY_S,
  }
}
