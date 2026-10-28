/**
 * How far the aurora reaches (#77): the equatorward edge of the OVATION oval, per
 * longitude and hemisphere. OVATION's value per 1° cell is SWPC's chance (%) of
 * visible aurora overhead. Shared by /api/aurora (which computes it over the full
 * grid, before its trim) and the clients that draw and describe it.
 */

export type ReachPoint = [lon: number, lat: number]
export interface Reach {
  n: ReachPoint[]
  s: ReachPoint[]
}

/** "Likely" and "possible" overhead, in OVATION percent. */
export const REACH_LIKELY = 10
export const REACH_POSSIBLE = 5

/**
 * Aurora about 110 km up sits on the horizon ~10.6° of ground arc away
 * (acos(Re / (Re + 110 km))); 9° allows for a few degrees of elevation and haze.
 */
export const HORIZON_REACH_DEG = 9

const normalizeLon = (lon: number) => (lon >= 180 ? lon - 360 : lon)

/** The most equatorward cell at or above `threshold`, per longitude, in each hemisphere. */
export function auroraReach(
  cells: readonly (readonly [number, number, number])[],
  threshold: number,
): Reach {
  const north = new Map<number, number>()
  const south = new Map<number, number>()
  for (const [lon, lat, chance] of cells) {
    if (chance < threshold || lat === 0) continue
    const key = normalizeLon(lon)
    if (lat > 0) {
      const best = north.get(key)
      if (best === undefined || lat < best) north.set(key, lat)
    } else {
      const best = south.get(key)
      if (best === undefined || lat > best) south.set(key, lat)
    }
  }
  const line = (m: Map<number, number>): ReachPoint[] =>
    [...m].sort((a, b) => a[0] - b[0]).map(([lon, lat]): ReachPoint => [lon, lat])
  return { n: line(north), s: line(south) }
}

/** The point of a hemisphere's line closest to the equator, or null for an empty line. */
export function reachExtreme(line: readonly ReachPoint[]): { lon: number; lat: number } | null {
  let best: ReachPoint | null = null
  for (const p of line) if (!best || Math.abs(p[1]) < Math.abs(best[1])) best = p
  return best ? { lon: best[0], lat: best[1] } : null
}

/**
 * Contiguous runs of a sorted line (neighbours 1° apart), joined across the
 * antimeridian, for drawing. Runs of a single point are dropped.
 */
export function reachSegments(line: readonly ReachPoint[]): ReachPoint[][] {
  const runs: ReachPoint[][] = []
  for (const p of line) {
    const run = runs.at(-1)
    const prev = run?.at(-1)
    if (run && prev && p[0] - prev[0] === 1) run.push(p)
    else runs.push([p])
  }
  const first = runs[0]
  const last = runs.at(-1)
  if (runs.length > 1 && first && last && first[0]?.[0] === -180 && last.at(-1)?.[0] === 179) {
    runs[0] = [...last, ...first]
    runs.pop()
  }
  return runs.filter((r) => r.length > 1)
}
