/**
 * The fly-in's camera flight (#261): from a start point far out (flightStart, clear of every
 * body) straight in along that line to the arrival distance, eased in log distance
 * (flightDistanceKm) over FLIGHT_MS. Pure: the scene asks where the camera is at a time.
 */
import { flightDistanceKm } from '@/lib/orrery/trueScale'

/** The owner's choice (2026-11-17): about four seconds from start to arrival. */
export const FLIGHT_MS = 4_000
/** The flight starts this far from the craft, km, unless a body is nearer (flightStart). */
export const FLIGHT_START_KM = 1_000_000

export interface Flight {
  /** Unit direction from the craft to the camera, scene axes. */
  readonly direction: readonly [number, number, number]
  /** Start and arrival distances, scene units. */
  readonly from: number
  readonly to: number
  /** When it started, ms (performance.now()). */
  readonly startMs: number
}

/** The camera's distance from the craft at `nowMs`, and whether the flight is over. */
export function flightAt(f: Flight, nowMs: number): { distance: number; done: boolean } {
  const s = (nowMs - f.startMs) / FLIGHT_MS
  if (s >= 1) return { distance: f.to, done: true }
  return { distance: flightDistanceKm(s, f.from, f.to), done: false }
}
