/**
 * Positions between Horizons samples (#93). Inside the fine span: cubic Hermite with the
 * sampled velocities, which reproduces Horizons' own in-between samples to within a few
 * km (tests/unit/orrery-ephemeris.test.ts). Outside it, inside the whole-mission span:
 * Catmull-Rom through the coarse positions, marked coarse. Outside both: nothing. A
 * position is never extrapolated past the data (spec Part 14).
 */
import type { OrreryTrack, SampledSpan } from '@/schemas/orreryBodies'

import type { Vec3 } from './scale'
import { AU_KM } from './units'

export interface TrackState {
  position: Vec3
  /** au/day. From the Hermite velocities (fine) or the spline's slope (coarse). */
  velocity: Vec3
  /** Which span answered: 'fine' (position and velocity sampled) or 'coarse'. */
  resolution: 'fine' | 'coarse'
}

const SECONDS_PER_DAY = 86_400

function count(span: SampledSpan, stride: number): number {
  return Math.floor(span.samples.length / stride)
}

/** Index and fraction of `jd` in a span, or null outside it. */
function locate(span: SampledSpan, stride: number, jd: number): { i: number; s: number } | null {
  const n = count(span, stride)
  if (n < 2) return null
  const u = (jd - span.start) / span.step
  if (u < 0 || u > n - 1) return null
  const i = Math.min(n - 2, Math.floor(u))
  return { i, s: u - i }
}

const at = (span: SampledSpan, stride: number, i: number, k: number) =>
  span.samples[i * stride + k] ?? 0

function hermite(span: SampledSpan, jd: number): TrackState | null {
  const loc = locate(span, 6, jd)
  if (!loc) return null
  const { i, s } = loc
  const h = span.step
  const s2 = s * s
  const s3 = s2 * s
  // Basis functions and their derivatives in s.
  const h00 = 2 * s3 - 3 * s2 + 1
  const h10 = s3 - 2 * s2 + s
  const h01 = -2 * s3 + 3 * s2
  const h11 = s3 - s2
  const d00 = 6 * s2 - 6 * s
  const d10 = 3 * s2 - 4 * s + 1
  const d01 = -6 * s2 + 6 * s
  const d11 = 3 * s2 - 2 * s
  const axis = (k: number) => {
    const p0 = at(span, 6, i, k)
    const p1 = at(span, 6, i + 1, k)
    const v0 = at(span, 6, i, k + 3)
    const v1 = at(span, 6, i + 1, k + 3)
    return {
      p: h00 * p0 + h10 * h * v0 + h01 * p1 + h11 * h * v1,
      v: (d00 * p0 + d10 * h * v0 + d01 * p1 + d11 * h * v1) / h,
    }
  }
  const x = axis(0)
  const y = axis(1)
  const z = axis(2)
  return {
    position: { x: x.p, y: y.p, z: z.p },
    velocity: { x: x.v, y: y.v, z: z.v },
    resolution: 'fine',
  }
}

function catmullRom(span: SampledSpan, jd: number): TrackState | null {
  const loc = locate(span, 3, jd)
  if (!loc) return null
  const n = count(span, 3)
  const { i, s } = loc
  const h = span.step
  const idx = (j: number) => Math.max(0, Math.min(n - 1, j))
  const axis = (k: number) => {
    const p0 = at(span, 3, i, k)
    const p1 = at(span, 3, i + 1, k)
    // Tangents from the neighbours (one-sided at the ends), per day.
    const m0 = (p1 - at(span, 3, idx(i - 1), k)) / ((i + 1 - idx(i - 1)) * h)
    const m1 = (at(span, 3, idx(i + 2), k) - p0) / ((idx(i + 2) - i) * h)
    const s2 = s * s
    const s3 = s2 * s
    return {
      p:
        (2 * s3 - 3 * s2 + 1) * p0 +
        (s3 - 2 * s2 + s) * h * m0 +
        (-2 * s3 + 3 * s2) * p1 +
        (s3 - s2) * h * m1,
      v:
        ((6 * s2 - 6 * s) * p0 +
          (3 * s2 - 4 * s + 1) * h * m0 +
          (-6 * s2 + 6 * s) * p1 +
          (3 * s2 - 2 * s) * h * m1) /
        h,
    }
  }
  const x = axis(0)
  const y = axis(1)
  const z = axis(2)
  return {
    position: { x: x.p, y: y.p, z: z.p },
    velocity: { x: x.v, y: y.v, z: z.v },
    resolution: 'coarse',
  }
}

/** Where a tracked body is at a Julian date (TDB), or null when no data covers it. */
export function stateAt(track: OrreryTrack, jd: number): TrackState | null {
  if (track.fine) {
    const fine = hermite(track.fine, jd)
    if (fine) return fine
  }
  if (track.coarse) return catmullRom(track.coarse, jd)
  return null
}

/** The whole-mission path, oldest first, for the trajectory line (spec Part 14). */
export function trajectoryPoints(track: OrreryTrack): (Vec3 & { jd: number })[] {
  const span = track.coarse
  if (!span) return []
  const out: (Vec3 & { jd: number })[] = []
  for (let i = 0; i < count(span, 3); i += 1) {
    out.push({
      jd: span.start + i * span.step,
      x: at(span, 3, i, 0),
      y: at(span, 3, i, 1),
      z: at(span, 3, i, 2),
    })
  }
  return out
}

/**
 * Range rate of an object seen from a reference, km/s (spec Part 5.10):
 * dot(r, v) / |r| with r and v relative. Negative while approaching. Positions in au,
 * velocities in au/day.
 */
export function rangeRateFromStates(
  objectPos: Vec3,
  objectVel: Vec3,
  refPos: Vec3,
  refVel: Vec3,
): number {
  const rx = objectPos.x - refPos.x
  const ry = objectPos.y - refPos.y
  const rz = objectPos.z - refPos.z
  const r = Math.hypot(rx, ry, rz)
  if (r === 0) return 0
  const dot =
    rx * (objectVel.x - refVel.x) + ry * (objectVel.y - refVel.y) + rz * (objectVel.z - refVel.z)
  return ((dot / r) * AU_KM) / SECONDS_PER_DAY
}
