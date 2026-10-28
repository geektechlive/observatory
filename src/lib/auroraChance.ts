/**
 * Aurora chance at the user's location (#80). /api/aurora ships the whole OVATION grid
 * compactly (one character per 1° cell), so the location never leaves the browser and
 * one cache entry serves everyone. OVATION's value is SWPC's chance (%) of visible
 * aurora overhead. Shared by the function (encoding) and the Tonight panel (reading).
 */
import { HORIZON_REACH_DEG } from './auroraReach'

const ROWS = 181
const COLS = 360
const ZERO = 48 // '0'
/** Cells are capped here so every value stays one printable character ('0'..'}'). */
export const CELL_MAX = 77

/** Our estimate's weight for aurora seen only low on the poleward horizon. */
export const AURORA_HORIZON_WEIGHT = 0.5
/** Columns either side of the user's longitude searched for horizon aurora. */
const HORIZON_LON_DEG = 2

export const decodeCell = (ch: string): number => Math.max(0, (ch.codePointAt(0) ?? ZERO) - ZERO)

/** OVATION cells [lon 0..359, lat -90..90, %] as 181 strings, row 0 at 90°S. */
export function encodeGrid(cells: readonly (readonly [number, number, number])[]): string[] {
  const rows = Array.from({ length: ROWS }, () => new Array<number>(COLS).fill(0))
  for (const [lon, lat, v] of cells) {
    const row = rows[Math.round(lat) + 90]
    if (row) row[((Math.round(lon) % COLS) + COLS) % COLS] = Math.min(Math.max(v, 0), CELL_MAX)
  }
  return rows.map((r) => r.map((v) => String.fromCharCode(ZERO + Math.round(v))).join(''))
}

/** The chance (%) in the cell nearest (lat, lon); longitude in either convention. */
export function gridValue(grid: readonly string[], lat: number, lon: number): number {
  const row = grid[Math.round(lat) + 90]
  if (!row) return 0
  const col = ((Math.round(lon) % COLS) + COLS) % COLS
  return decodeCell(row[col] ?? '')
}

/**
 * Overhead: OVATION at the user's cell. Horizon: the highest value up to 9° poleward
 * (aurora ~110 km up sits on the horizon ~10.6° away), within 2° of longitude.
 * Chance: the larger of overhead and half the horizon value. The half weight is our
 * estimate, for aurora that is low and often hidden; the panel says so.
 */
export function auroraChanceAt(
  grid: readonly string[],
  lat: number,
  lon: number,
): { overhead: number; horizon: number; chance: number } {
  const overhead = gridValue(grid, lat, lon)
  const poleward = lat >= 0 ? 1 : -1
  let horizon = 0
  for (let d = 1; d <= HORIZON_REACH_DEG; d++) {
    for (let dl = -HORIZON_LON_DEG; dl <= HORIZON_LON_DEG; dl++) {
      horizon = Math.max(horizon, gridValue(grid, lat + poleward * d, lon + dl))
    }
  }
  horizon = Math.max(horizon, overhead)
  return { overhead, horizon, chance: Math.max(overhead, AURORA_HORIZON_WEIGHT * horizon) }
}

interface KpEntry {
  time: string
  kp: number
  kind: string
}

const KP_BIN_MS = 3 * 3_600_000

/** The Kp forecast for the 3-hour bin `time` falls in; NOAA's time tags are UTC. */
export function kpAt<T extends KpEntry>(forecast: readonly T[], time: Date): T | null {
  const t = time.getTime()
  for (const entry of forecast) {
    const start = Date.parse(entry.time.endsWith('Z') ? entry.time : `${entry.time}Z`)
    if (t >= start && t < start + KP_BIN_MS) return entry
  }
  return null
}
