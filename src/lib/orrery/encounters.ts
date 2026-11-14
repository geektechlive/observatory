/**
 * Close passes that daily samples can't follow (#230). Craft are sampled once a day (Parker
 * twice) and drawn by cubic Hermite, which reproduces Horizons to within a few km on a
 * cruising arc. A planetary flyby or perijove lasts hours: there, the daily curve misses
 * by thousands of km (Europa Clipper's 3 Dec 2026 Earth flyby: drawn ~660 km under the
 * surface, against Horizons' 9,609 km from the centre).
 *
 * The check needs no planet positions: rebuild each sample from its two neighbours (one
 * Hermite step of twice the spacing) and compare. On today's craft this "double-step"
 * miss is under 80 km while cruising and 80,000–400,000 km through a pass, so a pass shows
 * up in the data itself, whichever body it is near.
 *
 * Shared by the refresh job (which asks Horizons for a dense span over a short run) and
 * the client (which lowers confidence where no dense span covers a run). No imports and
 * erasable syntax only: scripts/orrery-bodies.mjs imports this file.
 */

/** A span of uniform samples: [x, y, z, vx, vy, vz] each, au and au/day. */
export interface DenseCapableSpan {
  readonly start: number
  readonly step: number
  readonly samples: readonly number[]
}

/** A stretch of a daily span the samples can't follow. Julian dates (TDB). */
export interface RoughRun {
  readonly start: number
  readonly end: number
  /** The largest double-step miss in the run, km. */
  readonly worstKm: number
  /** The sample the worst miss was measured at. */
  readonly worstJd: number
}

const AU_KM = 149_597_870.7
const STRIDE = 6

/**
 * A double-step miss above this marks a stretch the samples can't follow. Cruising craft
 * stay under 80 km and the Moon at 75 km, while every pass seen starts above 2,000 km, so
 * 1,000 km sits between the two with room either side. A miss this size would also be
 * visible against a planet: Earth's radius is 6,371 km.
 */
export const ROUGH_MISS_KM = 1_000
/** Days of dense samples asked for around a pass, centred on its worst sample. */
export const ENCOUNTER_WINDOW_DAYS = 3
/** Ten minutes, as the asteroids' close-pass spans (#215): 433 samples over 3 days. */
export const ENCOUNTER_STEP_DAYS = 10 / 1440
/**
 * A rough run longer than this is not a pass but an orbiter that circles its planet every
 * few hours (BepiColombo at Mercury from late 2026): no affordable step follows that for
 * weeks, so it gets no dense span, only the lowered confidence.
 */
export const ENCOUNTER_MAX_RUN_DAYS = 10

function hermiteMid(p0: number, v0: number, p1: number, v1: number, h: number): number {
  // Cubic Hermite at s = 0.5 over an interval of length h.
  return 0.5 * p0 + 0.125 * h * v0 + 0.5 * p1 - 0.125 * h * v1
}

/** The double-step miss at interior sample i, km. */
function missKm(span: DenseCapableSpan, i: number): number {
  const at = (j: number, k: number) => span.samples[j * STRIDE + k] ?? 0
  let sq = 0
  for (let k = 0; k < 3; k += 1) {
    const p = hermiteMid(
      at(i - 1, k),
      at(i - 1, k + 3),
      at(i + 1, k),
      at(i + 1, k + 3),
      2 * span.step,
    )
    sq += (p - at(i, k)) ** 2
  }
  return Math.sqrt(sq) * AU_KM
}

/**
 * The stretches of a span whose samples can't follow the path: each flagged interior
 * sample marks the two steps around it, and overlapping marks merge into one run.
 */
export function roughRuns(span: DenseCapableSpan): RoughRun[] {
  const n = Math.floor(span.samples.length / STRIDE)
  const runs: RoughRun[] = []
  for (let i = 1; i + 1 < n; i += 1) {
    const km = missKm(span, i)
    if (km <= ROUGH_MISS_KM) continue
    const start = span.start + (i - 1) * span.step
    const end = span.start + (i + 1) * span.step
    const jd = span.start + i * span.step
    const last = runs[runs.length - 1]
    if (last && start <= last.end) {
      runs[runs.length - 1] = {
        start: last.start,
        end,
        worstKm: Math.max(last.worstKm, km),
        worstJd: km > last.worstKm ? jd : last.worstJd,
      }
    } else {
      runs.push({ start, end, worstKm: km, worstJd: jd })
    }
  }
  return runs
}

/**
 * The dense span to ask Horizons for over a run: ENCOUNTER_WINDOW_DAYS centred on its
 * worst sample, kept inside the daily span. Null for a run too long to be a pass.
 */
export function encounterWindow(
  run: RoughRun,
  span: DenseCapableSpan,
): { start: number; stop: number } | null {
  if (run.end - run.start > ENCOUNTER_MAX_RUN_DAYS) return null
  const first = span.start
  const last = span.start + (Math.floor(span.samples.length / STRIDE) - 1) * span.step
  const start = Math.max(
    first,
    Math.min(run.worstJd - ENCOUNTER_WINDOW_DAYS / 2, last - ENCOUNTER_WINDOW_DAYS),
  )
  return { start, stop: start + ENCOUNTER_WINDOW_DAYS }
}

const runsBySpan = new WeakMap<DenseCapableSpan, RoughRun[]>()

/** Whether `jd` falls in a rough run of this span (computed once per span). */
export function inRoughRun(span: DenseCapableSpan, jd: number): boolean {
  let runs = runsBySpan.get(span)
  if (!runs) {
    runs = roughRuns(span)
    runsBySpan.set(span, runs)
  }
  return runs.some((r) => jd >= r.start && jd <= r.end)
}
