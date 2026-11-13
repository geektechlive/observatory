// The Tonight panel's comets (#135), cut by scripts/refresh-data.mjs from the comet
// payload it has just built (orrery-smallbodies.mjs), so it costs no JPL request. The
// panel needs only the bodies with a magnitude law and a few days of their spans; the full
// payload (164 KB, 72 KB gzip) carries ±30 days of every body, elements and solutions for
// the orrery. Its own KV key (horizons:comets-tonight:v2), streamed by
// /api/comets-tonight, so the Function never parses the big body (10 ms CPU).
//
// v2 (#99 item 4) also carries the bright asteroids the same step placed, cut to the same
// window. They ride here and not in the comet body (ADR 0023): the Tonight panel and the
// orrery's "Bright asteroids" switch read this slice, and a visitor who wants only comets
// downloads no asteroid.

const JD_UNIX_EPOCH = 2440587.5
const DAY_MS = 86_400_000
/** [x, y, z, vx, vy, vz] per fine sample; [x, y, z] per coarse sample. */
const FINE_STRIDE = 6
const COARSE_STRIDE = 3

/**
 * The slice runs from a day before the refresh to a week after. The copy is fresh for 72 h
 * and tonight's dark window can end up to about a day and a half ahead, so a week leaves
 * days to spare for a copy served stale while the job is down; the day before covers light
 * time (minutes to hours) and a window that began before the refresh.
 */
export const TONIGHT_DAYS_BEFORE = 1
export const TONIGHT_DAYS_AFTER = 7

const jdOf = (ms) => ms / DAY_MS + JD_UNIX_EPOCH

/**
 * The samples of `span` that bracket [fromJd, toJd], plus `pad` neighbours each side (the
 * coarse spline takes its tangents from them), or null when fewer than two remain.
 */
export function trimSpan(span, stride, fromJd, toJd, pad = 0) {
  if (!span) return null
  const n = span.samples.length / stride
  const first = Math.max(0, Math.floor((fromJd - span.start) / span.step) - pad)
  const last = Math.min(n - 1, Math.ceil((toJd - span.start) / span.step) + pad)
  if (last - first < 1) return null
  return {
    start: span.start + first * span.step,
    step: span.step,
    samples: span.samples.slice(first * stride, (last + 1) * stride),
  }
}

/** Tonight's dark window ends at most about a day and a half ahead; two days is the margin. */
const TONIGHT_COVER_DAYS = 2

/**
 * The asteroids of the last Tonight slice (a parsed v2 body, or anything else) whose fine
 * samples still cover tonight, for a run that placed none: carried forward, so one failed
 * asteroid step neither wipes yesterday's good list nor fails the comets-tonight contract
 * while the comets are fine. Empty when there is no usable previous slice.
 */
export function carryForwardAsteroids(previousSlice, nowMs) {
  const list = previousSlice?.asteroids
  if (!Array.isArray(list)) return []
  const fromJd = jdOf(nowMs)
  return list.filter(
    (a) =>
      a?.fine && covers(a.fine, FINE_STRIDE, fromJd, fromJd + TONIGHT_COVER_DAYS),
  )
}

const covers = (span, stride, fromJd, toJd) =>
  span !== null &&
  span.start <= fromJd &&
  span.start + (span.samples.length / stride - 1) * span.step >= toJd

/**
 * The /api/comets-tonight payload from a /api/orrery-smallbodies payload (and the asteroids
 * buildOrrerySmallBodies returned beside it): every comet and
 * interstellar object with a magnitude law (1I has only an asteroid's H, so it is left
 * out, as the panel would), with its spans cut to the window. Coarse samples are kept
 * only where the fine span does not cover the window.
 */
export function buildCometsTonight(payload, asteroids = []) {
  const at = Date.parse(payload.generatedAt)
  const fromJd = jdOf(at) - TONIGHT_DAYS_BEFORE
  const toJd = jdOf(at) + TONIGHT_DAYS_AFTER
  const comets = []
  for (const b of [...payload.comets, ...payload.interstellar]) {
    if (b.m1 === null || b.k1 === null) continue
    const fine = trimSpan(b.fine, FINE_STRIDE, fromJd, toJd)
    const coarse = covers(fine, FINE_STRIDE, fromJd, toJd)
      ? null
      : trimSpan(b.coarse, COARSE_STRIDE, fromJd, toJd, 1)
    if (!fine && !coarse) continue
    comets.push({
      id: b.id,
      name: b.name,
      interstellar: b.interstellar,
      m1: b.m1,
      k1: b.k1,
      fine,
      coarse,
    })
  }
  const rocks = []
  for (const a of asteroids) {
    const fine = trimSpan(a.fine, FINE_STRIDE, fromJd, toJd)
    if (!fine) continue
    rocks.push({
      id: a.id,
      spkid: a.spkid,
      name: a.name,
      h: a.h,
      g: a.g,
      gAssumed: a.gAssumed,
      elements: a.elements,
      fine,
    })
  }
  return {
    generatedAt: payload.generatedAt,
    frame: payload.frame,
    center: payload.center,
    timeScale: payload.timeScale,
    provider: payload.provider,
    window: { fromJd, toJd },
    comets,
    asteroids: rocks,
  }
}
