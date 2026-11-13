// The orrery's comets and interstellar objects for scripts/refresh-data.mjs (#99):
// the comets JPL forecasts brightest tonight (SBDB Query, ranked by JPL's own magnitude
// law), and 1I, 2I and 3I, each with Horizons vectors. Built here so the Pages Function
// only passes the finished body through (10 ms CPU), as for the craft (orrery-bodies.mjs).
//
// SBDB and Horizons are both JPL, and JPL's Fair Use asks for "only one API request at a
// time", so every request goes through one paced queue, and the step runs after the
// close-approach step in refresh-data.mjs, never beside it.
import { conicPosition, solveEllipticAnomaly, vInfinityKms } from '../src/lib/orrery/conic.ts'
import { coarseStepDays, COARSE_FUTURE_YEARS, FINE_WINDOW_DAYS } from '../src/lib/orrery/craft.ts'
import { parseSmallBodyHeader } from '../src/lib/horizons.ts'
import {
  DEFAULT_SLOPE_G,
  INTERSTELLAR,
  parseSbdbAsteroids,
  parseSbdbComets,
  sbdbAsteroidQueryUrl,
  sbdbCometQueryUrl,
  selectAsteroids,
  selectComets,
  smallBodyCommand,
  targetMatchesAsteroid,
  targetMatchesSmallBody,
} from '../src/lib/orrery/smallBodies.ts'
import { BudgetExceeded, fetchSpan, jdFromMs, toSpan } from './orrery-bodies.mjs'

const DAY_MS = 86_400_000
const RAD = Math.PI / 180
/** Daily samples for the fine span: Hermite on them holds a comet at 0.3 au from the Sun. */
const FINE_STEP_DAYS = 1
/** The interstellar objects' long span starts this long before perihelion. */
const YEARS_BEFORE_PERIHELION = 3
/** Reuse the long spans while they are younger than this. */
const COARSE_MAX_AGE_MS = DAY_MS
/** Pause before each JPL request (the close-approach step's last one may have just ended). */
const DEFAULT_PAUSE_MS = 1000
/** Inside the workflow's 10 minutes, after the craft step's 4 and the close-approach step's 2. */
export const DEFAULT_BUDGET_MS = 90_000

const reasonOf = (err) => (err instanceof Error ? err.message : String(err))

/**
 * Earth (the Earth-Moon barycentre) from JPL's Table 1 elements, heliocentric ecliptic
 * J2000, au: within about 0.0001 au, plenty to forecast a comet's brightness.
 */
export function earthHeliocentric(jd) {
  const T = (jd - 2451545) / 36525
  const e = 0.01671123 - 0.00004392 * T
  const a = 1.00000261 + 0.00000562 * T
  const L = 100.46457166 + 35999.37244981 * T
  const peri = 102.93768193 + 0.32327364 * T
  const E = solveEllipticAnomaly((L - peri) * RAD, e)
  const xp = a * (Math.cos(E) - e)
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const c = Math.cos(peri * RAD)
  const s = Math.sin(peri * RAD)
  return { x: c * xp - s * yp, y: s * xp + c * yp, z: 0 }
}

const elementsOf = (h) => ({ epochJd: h.epochJd, e: h.e, q: h.q, tp: h.tp, om: h.om, w: h.w, i: h.i })
const solutionOf = (h) => ({
  ref: h.solutionRef,
  date: h.solutionDate,
  observations: h.observations,
  dataArc: h.dataArc,
})

/**
 * Ask Horizons for one span of a small body. Returns the samples and what its header
 * says (elements, magnitude law, solution), checking the target is the one asked for.
 */
async function fetchSmallBodySpan(body, startJd, stopJd, step, ask, now) {
  let header = null
  const spec = {
    naifId: body.spkid,
    command: smallBodyCommand(body.spkid, body.kind),
    targetOk: (target) =>
      body.kind === 'asteroid'
        ? targetMatchesAsteroid(body.des, target)
        : targetMatchesSmallBody(body.des, target),
  }
  const remember = async (url) => {
    const text = await ask(url)
    header ??= parseSmallBodyHeader(text)
    return text
  }
  const got = await fetchSpan(spec, startJd, stopJd, step, remember, now)
  return { ...got, header }
}

/**
 * Build the /api/orrery-smallbodies payload, and the bright asteroids beside it (#99 item
 * 4). `previous` is the last payload, whose long interstellar spans are reused while younger
 * than a day. Objects that fail are listed in `missing`; the step fails only when no comet
 * or interstellar object could be placed. The asteroids come last in the one JPL queue, so
 * a spent time budget cuts asteroids and never comets, and they are returned apart from
 * the payload: only the Tonight slice carries them (ADR 0023), so the comet body does not
 * grow for visitors who never switch them on.
 */
export async function buildOrrerySmallBodies({
  now = Date.now(),
  fetchJplJson,
  fetchHorizonsText,
  pauseMs = DEFAULT_PAUSE_MS,
  budgetMs = DEFAULT_BUDGET_MS,
  clock = Date.now,
  previous = null,
}) {
  const began = clock()
  let asked = 0
  // The one JPL queue: callers await each request before the next, never in parallel.
  const jpl = async (fetcher, url) => {
    if (clock() - began > budgetMs) throw new BudgetExceeded('time budget spent')
    if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs))
    asked += 1
    return fetcher(url)
  }
  const ask = (url) => jpl(fetchHorizonsText, url)
  const missing = []
  const nowJd = jdFromMs(now)
  const fineStart = jdFromMs(Math.floor((now - FINE_WINDOW_DAYS * DAY_MS) / DAY_MS) * DAY_MS)
  const fineStop = fineStart + 2 * FINE_WINDOW_DAYS

  let chosen = []
  try {
    const comets = parseSbdbComets(await jpl(fetchJplJson, sbdbCometQueryUrl(nowJd)))
    chosen = selectComets(comets, nowJd, { positionAt: conicPosition, earthAt: earthHeliocentric })
  } catch (err) {
    missing.push({ id: 'jpl-sbdb-query', reason: reasonOf(err) })
  }

  const comets = []
  for (const c of chosen) {
    const id = `sb:${c.spkid}`
    const body = { ...c, kind: 'comet' }
    const got = await fetchSmallBodySpan(body, fineStart, fineStop, FINE_STEP_DAYS, ask, now).then(
      (span) => {
        if (!span.samples) throw new Error('no samples in the window')
        return span
      },
    ).catch((err) => {
      missing.push({ id, reason: reasonOf(err) })
      return null
    })
    const header = got?.header ?? null
    const elements = header ? elementsOf(header) : { epochJd: null, e: c.e, q: c.q, tp: c.tp, om: c.om, w: c.w, i: c.i }
    comets.push({
      id,
      spkid: c.spkid,
      des: c.des,
      name: c.name,
      kind: 'comet',
      interstellar: false,
      discovered: null,
      magnitude: Number(c.magnitude.toFixed(1)),
      m1: header?.m1 ?? c.m1,
      k1: header?.k1 ?? c.k1,
      h: null,
      elements,
      elementsSource: header ? 'horizons' : 'sbdb',
      // Only for the interstellar objects: a comet's osculating orbit is often just past
      // e = 1 (C/2024 T5: 1.0022, "v∞" 0.7 km/s) and it is still bound to the Sun.
      vInfKms: null,
      solution: header ? solutionOf(header) : null,
      target: got?.target ?? null,
      availableFrom: got?.availableFrom ?? null,
      availableTo: got?.availableTo ?? null,
      fine: got ? toSpan(got.samples, true) : null,
      coarse: null,
    })
  }

  const prevAt = previous?.coarseFetchedAt ? Date.parse(previous.coarseFetchedAt) : Number.NaN
  const reuseCoarse = Number.isFinite(prevAt) && now - prevAt < COARSE_MAX_AGE_MS
  const prevById = new Map((previous?.interstellar ?? []).map((o) => [o.id, o]))
  const coarseStop = jdFromMs(Math.floor((now + COARSE_FUTURE_YEARS * 365.25 * DAY_MS) / DAY_MS) * DAY_MS)

  const interstellar = []
  for (const spec of INTERSTELLAR) {
    const id = `sb:${spec.spkid}`
    try {
      const fine = await fetchSmallBodySpan(spec, fineStart, fineStop, FINE_STEP_DAYS, ask, now)
      const header = fine.header
      if (!header) throw new Error('Horizons gave no orbital elements')
      const prev = prevById.get(id)
      let coarse = null
      let learnt = fine
      if (reuseCoarse && prev?.coarse) {
        coarse = prev.coarse
        learnt = { ...learnt, availableFrom: prev.availableFrom, availableTo: prev.availableTo }
      } else {
        const startJd = Math.floor(header.tp - YEARS_BEFORE_PERIHELION * 365.25) + 0.5
        const step = coarseStepDays(coarseStop - startJd, spec.maxCoarseStepDays)
        const got = await fetchSmallBodySpan(spec, startJd, coarseStop, step, ask, now)
        coarse = got.samples ? toSpan(got.samples, false) : null
        learnt = { ...learnt, availableFrom: got.availableFrom, availableTo: got.availableTo }
      }
      if (!fine.samples && !coarse) throw new Error('no samples in any span')
      const elements = elementsOf(header)
      interstellar.push({
        id,
        spkid: spec.spkid,
        des: spec.des,
        name: spec.name,
        kind: spec.kind,
        interstellar: true,
        discovered: spec.discovered,
        magnitude: null,
        m1: header.m1,
        k1: header.k1,
        h: header.h,
        elements,
        elementsSource: 'horizons',
        vInfKms: vInfinityKms(elements),
        solution: solutionOf(header),
        target: fine.target,
        availableFrom: learnt.availableFrom ?? fine.availableFrom ?? null,
        availableTo: learnt.availableTo ?? fine.availableTo ?? null,
        fine: fine.samples ? toSpan(fine.samples, true) : null,
        coarse,
      })
    } catch (err) {
      missing.push({ id, reason: reasonOf(err) })
    }
  }

  if (!comets.some((c) => c.fine) && interstellar.length === 0) {
    throw new Error(`no comet or interstellar object could be placed: ${missing.map((m) => m.reason).join('; ')}`)
  }

  const asteroids = await buildAsteroids({ nowJd, fineStart, fineStop, ask, jpl, fetchJplJson, missing, now })

  return {
    payload: {
      generatedAt: new Date(now).toISOString(),
      coarseFetchedAt: reuseCoarse ? previous.coarseFetchedAt : new Date(now).toISOString(),
      frame: 'ecliptic-J2000',
      center: 'Sun',
      timeScale: 'TDB',
      units: { position: 'au', velocity: 'au/day' },
      sourceType: 'ephemeris',
      provider: 'jpl-horizons',
      comets,
      interstellar,
      missing,
    },
    asteroids,
    requests: asked,
  }
}

/**
 * The bright asteroids (#99 item 4): one SBDB query, ranked by the H,G law, then one Horizons
 * request each for ±30 days daily with velocities, target name checked. A failure of any
 * kind (the query, one object, the time budget) lands in `missing`; the rest still ship.
 */
async function buildAsteroids({ nowJd, fineStart, fineStop, ask, jpl, fetchJplJson, missing, now }) {
  let chosen = []
  try {
    const rows = parseSbdbAsteroids(await jpl(fetchJplJson, sbdbAsteroidQueryUrl()))
    chosen = selectAsteroids(rows, nowJd, { positionAt: conicPosition, earthAt: earthHeliocentric })
  } catch (err) {
    missing.push({ id: 'jpl-sbdb-asteroids', reason: reasonOf(err) })
  }
  const asteroids = []
  for (const a of chosen) {
    const id = `sb:${a.spkid}`
    try {
      const body = { spkid: a.spkid, des: a.des, kind: 'asteroid' }
      const got = await fetchSmallBodySpan(body, fineStart, fineStop, FINE_STEP_DAYS, ask, now)
      if (!got.samples) throw new Error('no samples in the window')
      const elements = got.header
        ? elementsOf(got.header)
        : { epochJd: null, e: a.e, q: a.q, tp: a.tp, om: a.om, w: a.w, i: a.i }
      asteroids.push({
        id,
        spkid: a.spkid,
        des: a.des,
        name: a.name,
        h: a.h,
        g: a.g ?? DEFAULT_SLOPE_G,
        gAssumed: a.g === null,
        magnitude: Number(a.magnitude.toFixed(1)),
        elements,
        target: got.target ?? null,
        fine: toSpan(got.samples, true),
      })
    } catch (err) {
      missing.push({ id, reason: reasonOf(err) })
    }
  }
  return asteroids
}
