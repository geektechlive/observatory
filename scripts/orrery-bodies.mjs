// The orrery's Horizons step for scripts/refresh-data.mjs (#93): spacecraft, Earth and
// the Moon as heliocentric ecliptic J2000 state vectors, plus the major moons relative
// to their planets (#107, src/lib/orrery/moons.ts), sampled here so the Pages
// Function only passes the finished body through (10 ms CPU; and Horizons refuses
// overlapping requests, #88, so it must never be on the request path).
//
// One request at a time, with a pause between them (JPL's Fair Use: "only one API
// request at a time"). Each body gets a fine span (30 days either side of now, position
// and velocity) and, for craft, a whole-mission span (launch to five years out,
// positions only) that is refetched at most once a day. A span that runs past the
// ephemeris is clamped to where Horizons says it ends, and asked again.
import {
  parseEphemerisLimit,
  parseHorizonsVectors,
  parseObservedUntil,
} from '../src/lib/horizons.ts'
import {
  COARSE_FUTURE_YEARS,
  coarseStepDays,
  CRAFT,
  FINE_WINDOW_DAYS,
} from '../src/lib/orrery/craft.ts'
import { MOONS, moonStepDays, moonWindowDays } from '../src/lib/orrery/moons.ts'

const HORIZONS = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const DAY_MS = 86_400_000
const JD_UNIX_EPOCH = 2440587.5
/** Pause between Horizons requests. */
const DEFAULT_PAUSE_MS = 1000
/** The whole step stays well inside the workflow's 10-minute limit. */
export const DEFAULT_BUDGET_MS = 4 * 60_000
/** Reuse the whole-mission spans while they are younger than this. */
const COARSE_MAX_AGE_MS = DAY_MS
/** A span that hits an ephemeris limit is clamped and asked again, at most this often. */
const MAX_ATTEMPTS = 3
const POSITION_DECIMALS = 8 // 1e-8 au = 1.5 km
const VELOCITY_DECIMALS = 10

const jdFromMs = (ms) => ms / DAY_MS + JD_UNIX_EPOCH
const msFromJd = (jd) => (jd - JD_UNIX_EPOCH) * DAY_MS
const round = (value, decimals) => Number(value.toFixed(decimals))

export class BudgetExceeded extends Error {}

/** Horizons' STEP_SIZE: "30 m" below an hour (Phobos, #107), "12 h" below a day, else days. */
export function stepSize(days) {
  if (days < 1 / 24) return `${String(Math.round(days * 1440))} m`
  return days < 1 ? `${String(Math.round(days * 24))} h` : `${String(days)} d`
}

/**
 * A VECTORS request: ecliptic J2000, au and au/day, CSV. Centred on the Sun (500@10)
 * unless `center` names a body: a moon is asked relative to its planet (#107).
 */
export function horizonsUrl(command, startJd, stopJd, stepDays, center = '10') {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${command}'`,
    EPHEM_TYPE: 'VECTORS',
    CENTER: `'500@${center}'`,
    REF_PLANE: 'ECLIPTIC',
    REF_SYSTEM: 'ICRF',
    OUT_UNITS: 'AU-D',
    VEC_TABLE: '2',
    CSV_FORMAT: 'YES',
    START_TIME: `'JD${String(startJd)}'`,
    STOP_TIME: `'JD${String(stopJd)}'`,
    STEP_SIZE: `'${stepSize(stepDays)}'`,
  })
  return `${HORIZONS}?${params.toString()}`
}

/**
 * Ask for one span, clamping to the ephemeris limits Horizons reports. Returns the
 * samples (or null if the clamped span is empty) plus what was learnt about the span.
 * `spec.command` and `spec.targetOk` default to the NAIF id; small bodies (#92) pass
 * their own, since "433;" names Eros and its answer reads "433 Eros (A898 PA)".
 */
export async function fetchSpan(spec, startJd, stopJd, step, ask, now) {
  const command = spec.command ?? spec.naifId
  const targetOk = spec.targetOk ?? ((target) => target.includes(`(${spec.naifId})`))
  let start = startJd
  let stop = stopJd
  const learnt = { availableFrom: null, availableTo: null, observedUntil: null, target: null }
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (stop < start) return { samples: null, ...learnt }
    const text = await ask(horizonsUrl(command, start, stop, step, spec.center))
    // The tracking note sits in the header of every answer, refusals included.
    learnt.observedUntil ??= parseObservedUntil(text, now)
    const parsed = parseHorizonsVectors(text)
    if (parsed && parsed.samples.length > 0) {
      if (!parsed.target || !targetOk(parsed.target)) {
        throw new Error(`Horizons answered for target ${JSON.stringify(parsed.target)}`)
      }
      return { samples: parsed.samples, ...learnt, target: parsed.target }
    }
    const limit = parseEphemerisLimit(text)
    if (!limit) throw new Error(`no data and no ephemeris limit: ${text.slice(0, 160)}`)
    const limitJd = jdFromMs(Date.parse(limit.iso))
    if (limit.side === 'after') {
      learnt.availableTo = limit.iso
      stop = start + Math.floor((limitJd - start) / step) * step
    } else {
      learnt.availableFrom = limit.iso
      start = start + Math.ceil((limitJd - start) / step) * step
    }
  }
  throw new Error(`still outside the ephemeris after ${String(MAX_ATTEMPTS)} attempts`)
}

/** Uniform samples as one flat array; the step comes from the data itself. */
export function toSpan(samples, withVelocity) {
  const first = samples[0]
  const second = samples[1]
  const step = second ? round(second.jd - first.jd, 9) : 1
  for (let i = 1; i < samples.length; i += 1) {
    if (Math.abs(samples[i].jd - (first.jd + i * step)) > 1e-6) {
      throw new Error(`samples are not evenly spaced at ${String(samples[i].jd)}`)
    }
  }
  const flat = []
  for (const s of samples) {
    flat.push(round(s.x, POSITION_DECIMALS), round(s.y, POSITION_DECIMALS), round(s.z, POSITION_DECIMALS))
    if (withVelocity) {
      flat.push(round(s.vx, VELOCITY_DECIMALS), round(s.vy, VELOCITY_DECIMALS), round(s.vz, VELOCITY_DECIMALS))
    }
  }
  return { start: first.jd, step, samples: flat }
}

/**
 * Fetch every body in src/lib/orrery/craft.ts and return the /api/orrery-bodies payload.
 * `previous` is the last payload, whose whole-mission spans are reused while younger
 * than a day. Objects that fail are listed in `missing`; the rest still ship.
 */
export async function buildOrreryBodies({
  now = Date.now(),
  fetchText,
  pauseMs = DEFAULT_PAUSE_MS,
  budgetMs = DEFAULT_BUDGET_MS,
  clock = Date.now,
  previous = null,
  only = null,
}) {
  const began = clock()
  let asked = 0
  const ask = async (url) => {
    if (clock() - began > budgetMs) throw new BudgetExceeded('time budget spent')
    if (asked > 0 && pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs))
    asked += 1
    return fetchText(url)
  }

  const prevAt = previous?.coarseFetchedAt ? Date.parse(previous.coarseFetchedAt) : Number.NaN
  const reuseCoarse = Number.isFinite(prevAt) && now - prevAt < COARSE_MAX_AGE_MS
  const prevById = new Map((previous?.bodies ?? []).map((b) => [b.id, b]))

  const fineStart = jdFromMs(Math.floor((now - FINE_WINDOW_DAYS * DAY_MS) / DAY_MS) * DAY_MS)
  const fineStop = fineStart + 2 * FINE_WINDOW_DAYS
  const futureMs = now + COARSE_FUTURE_YEARS * 365.25 * DAY_MS
  const coarseStop = jdFromMs(Math.floor(futureMs / DAY_MS) * DAY_MS)

  const bodies = []
  const missing = []
  for (const spec of CRAFT) {
    if (only && !only.includes(spec.naifId)) continue
    const id = `naif:${spec.naifId}`
    try {
      const fine = await fetchSpan(spec, fineStart, fineStop, spec.fineStepDays, ask, now)
      let coarse = null
      let learnt = { availableFrom: null, availableTo: null, observedUntil: null, target: null }
      const prev = prevById.get(id)
      if (spec.launch && reuseCoarse && prev?.coarse) {
        coarse = prev.coarse
        learnt = { ...prev, target: prev.target }
      } else if (spec.launch) {
        const startJd = jdFromMs(Date.parse(`${spec.launch}T00:00:00Z`))
        const step = coarseStepDays(coarseStop - startJd, spec.maxCoarseStepDays)
        const got = await fetchSpan(spec, startJd, coarseStop, step, ask, now)
        coarse = got.samples ? toSpan(got.samples, false) : null
        learnt = got
      }
      if (!fine.samples && !coarse) throw new Error('no samples in any span')
      bodies.push({
        id,
        naifId: spec.naifId,
        name: spec.name,
        mission: spec.mission,
        category: spec.category,
        group: spec.group,
        target: fine.target ?? learnt.target ?? null,
        observedUntil: fine.observedUntil ?? learnt.observedUntil ?? null,
        availableFrom: fine.availableFrom ?? learnt.availableFrom ?? null,
        availableTo: fine.availableTo ?? learnt.availableTo ?? null,
        fine: fine.samples ? toSpan(fine.samples, true) : null,
        coarse,
      })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      missing.push({ id, reason })
    }
  }

  // The major moons (#107): a fine span each, relative to their planet, stepped so even
  // Io gets 14 samples an orbit. They go in `moons`, apart from the heliocentric bodies.
  // A fast moon (Phobos) gets a shorter window so it stays under MOON_MAX_SAMPLES.
  const moons = []
  for (const moon of MOONS) {
    if (only && !only.includes(moon.naifId)) continue
    const id = `naif:${moon.naifId}`
    const days = moonWindowDays(moon.periodDays)
    const moonStart = jdFromMs(Math.floor((now - days * DAY_MS) / DAY_MS) * DAY_MS)
    const moonStop = moonStart + 2 * days
    try {
      const spec = { naifId: moon.naifId, center: moon.parent.naifId }
      const got = await fetchSpan(spec, moonStart, moonStop, moonStepDays(moon.periodDays), ask, now)
      if (!got.samples) throw new Error('no samples in the moon window')
      moons.push({
        id,
        naifId: moon.naifId,
        name: moon.name,
        parent: { naifId: moon.parent.naifId, name: moon.parent.name },
        center: `500@${moon.parent.naifId}`,
        target: got.target,
        periodDays: moon.periodDays,
        semiMajorAxisKm: moon.semiMajorAxisKm,
        fine: toSpan(got.samples, true),
      })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      missing.push({ id, reason })
    }
  }

  const coarseFetchedAt = reuseCoarse ? previous.coarseFetchedAt : new Date(now).toISOString()
  return {
    payload: {
      generatedAt: new Date(now).toISOString(),
      coarseFetchedAt,
      frame: 'ecliptic-J2000',
      center: 'Sun',
      timeScale: 'TDB',
      units: { position: 'au', velocity: 'au/day' },
      sourceType: 'ephemeris',
      provider: 'jpl-horizons',
      bodies,
      moons,
      missing,
    },
    requests: asked,
  }
}

export { jdFromMs, msFromJd }
