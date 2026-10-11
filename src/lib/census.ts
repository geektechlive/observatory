/**
 * The bezel's live census, one segment per data lane (ROCI v2 spec section 5, #51).
 *
 * A lane that reads 0 because its feed failed must never look like a quiet Earth
 * (Codex finding 12), so every lane resolves to exactly one state:
 *   off      every layer feeding it is switched off
 *   loading  an enabled layer has no data yet
 *   error    an enabled layer failed with nothing to show
 *   stale    a refetch failed, older data is still drawn
 *   zero     the feeds answered and found nothing
 *   live     data is drawn
 * When a lane's layers disagree, the worst state wins: error, stale, loading, then live/zero.
 */
import { eonetKind, type Lane, LANES } from './palette'

export interface LayerStatus {
  enabled: boolean
  loading: boolean
  error: boolean
  hasData: boolean
  count: number
  /** EONET spans lanes: its count split by each event's lane. */
  byLane?: Partial<Record<Lane, number>> | undefined
}

export type CensusState = 'off' | 'loading' | 'error' | 'stale' | 'zero' | 'live'

export interface LaneCensus {
  lane: Lane
  state: CensusState
  count: number
}

/** Which toggleable layers feed which lane (globe layers only; map-only layers excluded). */
const LANE_LAYERS: Record<Lane, readonly string[]> = {
  orbital: ['satellites', 'launches'],
  thermal: ['fires', 'events'],
  space: ['fireballs'],
  geo: ['quakes', 'events'],
  hydro: ['events'],
}

/** Adapt a data hook's `{ data, isLoading, error }` result to a layer status. */
export function layerStatus(
  query: { isLoading: boolean; error: unknown; data: unknown },
  enabled: boolean,
  count: number,
): LayerStatus {
  return {
    enabled,
    loading: query.isLoading,
    error: query.error !== null && query.error !== undefined,
    hasData: query.data !== undefined,
    count,
  }
}

/** EONET events counted into the lanes their kinds belong to. */
export function eventsByLane(events: readonly { kind: string }[]): Partial<Record<Lane, number>> {
  const counts: Partial<Record<Lane, number>> = {}
  for (const e of events) {
    const lane = eonetKind(e.kind).lane
    counts[lane] = (counts[lane] ?? 0) + 1
  }
  return counts
}

const layerState = (s: LayerStatus): CensusState | null => {
  if (!s.enabled) return null
  if (s.error) return s.hasData ? 'stale' : 'error'
  if (s.loading && !s.hasData) return 'loading'
  return 'live'
}

const RANK: Record<CensusState, number> = {
  error: 5,
  stale: 4,
  loading: 3,
  live: 2,
  zero: 1,
  off: 0,
}

export function laneCensus(layers: Partial<Record<string, LayerStatus>>): LaneCensus[] {
  return (Object.keys(LANES) as Lane[]).map((lane) => {
    let state: CensusState = 'off'
    let count = 0
    for (const key of LANE_LAYERS[lane]) {
      const status = layers[key]
      if (!status) continue
      const s = layerState(status)
      if (s === null) continue
      const contribution = status.byLane ? (status.byLane[lane] ?? 0) : status.count
      if (status.hasData) count += contribution
      if (RANK[s] > RANK[state]) state = s
    }
    if (state === 'live' && count === 0) state = 'zero'
    return { lane, state, count }
  })
}
