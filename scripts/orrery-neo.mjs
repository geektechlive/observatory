// The orrery's close-approach step for scripts/refresh-data.mjs (#92): this fortnight's
// close approaches to Earth from JPL's Close Approach Data, each placed in 3D with
// Horizons vectors, plus JPL Scout's unconfirmed objects and ESA NEOCC's risk list and
// upcoming approaches. Built here so the Pages Function only passes the finished body
// through (10 ms CPU), as for the craft (orrery-bodies.mjs).
//
// CAD, Scout and Horizons are all JPL, and JPL's Fair Use asks for "only one API
// request at a time", so every JPL request goes through one paced queue. The step runs
// after the craft step in refresh-data.mjs, never beside it. NEOCC is ESA's: not paced.
import {
  cadApproaches,
  cadDesignations,
  horizonsSmallBodyCommand,
  parseNeoccCloseApproaches,
  parseNeoccRiskList,
  scoutObjects,
  selectApproaches,
  targetMatchesDesignation,
} from '../src/lib/orrery/closeApproach.ts'
import { BudgetExceeded, fetchSpan, jdFromMs, toSpan } from './orrery-bodies.mjs'

const CAD = 'https://ssd-api.jpl.nasa.gov/cad.api'
const SCOUT = 'https://ssd-api.jpl.nasa.gov/scout.api'
const NEOCC = 'https://neo.ssa.esa.int/PSDB-portlet/download'
const DAY_MS = 86_400_000
/** The CAD window, and the Horizons span, either side of now. */
export const WINDOW_DAYS = 10
/** Closest-approach distance cut-off, au. */
const DIST_MAX_AU = '0.05'
/** Objects placed with Horizons: each costs one request. */
export const MAX_APPROACHES = 25
/** Horizons step: 3 h. */
const STEP_DAYS = 0.125
/** ESA's risk list runs to about 2,200 objects; the payload keeps the top by Palermo scale. */
const RISK_LIST_TOP = 50
/** Pause before each JPL request (the craft step's last one may have just ended). */
const DEFAULT_PAUSE_MS = 1000
/** Inside the workflow's 10 minutes, after the craft step's own 4. */
export const DEFAULT_BUDGET_MS = 2 * 60_000

const ymd = (ms) => new Date(ms).toISOString().slice(0, 10)

/** CAD within 0.05 au over now ±10 days, with full names; `pha` keeps only PHAs. */
export function cadUrl(now, pha) {
  const params = new URLSearchParams({
    'date-min': ymd(now - WINDOW_DAYS * DAY_MS),
    'date-max': ymd(now + WINDOW_DAYS * DAY_MS),
    'dist-max': DIST_MAX_AU,
    fullname: 'true',
    diameter: 'true',
    sort: 'date',
  })
  if (pha) params.set('pha', 'true')
  return `${CAD}?${params.toString()}`
}

const neoccUrl = (file) => `${NEOCC}?file=${file}`
const reasonOf = (err) => (err instanceof Error ? err.message : String(err))

/** The risk list's top by Palermo scale, plus every entry for an object placed here. */
function riskListPayload(list, placedKeys) {
  const ranked = [...list.entries].sort((a, b) => (b.psMax ?? -Infinity) - (a.psMax ?? -Infinity))
  const top = ranked.slice(0, RISK_LIST_TOP)
  const extra = ranked.slice(RISK_LIST_TOP).filter((e) => placedKeys.has(e.key))
  return { updated: list.updated, total: list.entries.length, entries: [...top, ...extra] }
}

/**
 * Build the /api/orrery-neo payload. A CAD failure fails the step (there is nothing to
 * place without it); Scout, NEOCC, the PHA filter and single Horizons objects that
 * fail are listed in `missing` and the rest still ships.
 */
export async function buildOrreryNeo({
  now = Date.now(),
  fetchJplJson,
  fetchHorizonsText,
  fetchNeoccText,
  pauseMs = DEFAULT_PAUSE_MS,
  budgetMs = DEFAULT_BUDGET_MS,
  clock = Date.now,
  limit = MAX_APPROACHES,
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
  const missing = []

  let rows
  try {
    rows = cadApproaches(await jpl(fetchJplJson, cadUrl(now, false)))
  } catch (err) {
    throw new Error(`JPL CAD failed: ${reasonOf(err)}`, { cause: err })
  }
  let pha = new Set()
  try {
    pha = cadDesignations(await jpl(fetchJplJson, cadUrl(now, true)))
  } catch (err) {
    missing.push({ id: 'jpl-cad-pha', reason: reasonOf(err) })
  }
  let scout = null
  try {
    scout = { objects: scoutObjects(await jpl(fetchJplJson, SCOUT)) }
  } catch (err) {
    missing.push({ id: 'jpl-scout', reason: reasonOf(err) })
  }

  // ESA is a different host: no JPL pacing needed.
  let risk = null
  try {
    risk = parseNeoccRiskList(await fetchNeoccText(neoccUrl('esa_risk_list')))
  } catch (err) {
    missing.push({ id: 'esa-risk-list', reason: reasonOf(err) })
  }
  let esaApproaches = null
  try {
    esaApproaches = parseNeoccCloseApproaches(await fetchNeoccText(neoccUrl('esa_upcoming_close_app')))
  } catch (err) {
    missing.push({ id: 'esa-close-approaches', reason: reasonOf(err) })
  }
  const riskKeys = new Set((risk?.entries ?? []).map((e) => e.key))

  const start = jdFromMs(Math.floor((now - WINDOW_DAYS * DAY_MS) / DAY_MS) * DAY_MS)
  const stop = start + 2 * WINDOW_DAYS
  const horizonsAsk = (url) => jpl(fetchHorizonsText, url)
  const approaches = []
  for (const row of selectApproaches(rows, pha, limit)) {
    const id = `sb:${row.des}`
    let fine = null
    let target = null
    try {
      const spec = {
        naifId: row.des,
        command: horizonsSmallBodyCommand(row.des),
        targetOk: (t) => targetMatchesDesignation(row.des, t),
      }
      const got = await fetchSpan(spec, start, stop, STEP_DAYS, horizonsAsk, now)
      if (!got.samples) throw new Error('no samples in the window')
      fine = toSpan(got.samples, true)
      target = got.target
    } catch (err) {
      missing.push({ id, reason: reasonOf(err) })
    }
    approaches.push({
      id,
      des: row.des,
      name: row.name,
      orbitId: row.orbitId,
      pha: row.pha,
      riskListed: riskKeys.has(row.des),
      h: row.h,
      diameterKm: row.diameterKm,
      closeApproach: {
        jd: row.jd,
        date: row.date,
        distAu: row.distAu,
        distMinAu: row.distMinAu,
        distMaxAu: row.distMaxAu,
        vRelKms: row.vRelKms,
        vInfKms: row.vInfKms,
        tSigma: row.tSigma,
      },
      target,
      fine,
    })
  }

  const placed = new Set(approaches.map((a) => a.des))
  return {
    payload: {
      generatedAt: new Date(now).toISOString(),
      frame: 'ecliptic-J2000',
      center: 'Sun',
      timeScale: 'TDB',
      units: { position: 'au', velocity: 'au/day' },
      sourceType: 'ephemeris',
      provider: 'jpl-horizons',
      window: { from: ymd(now - WINDOW_DAYS * DAY_MS), to: ymd(now + WINDOW_DAYS * DAY_MS) },
      approaches,
      scout,
      esa: {
        riskList: risk ? riskListPayload(risk, placed) : null,
        closeApproaches: esaApproaches,
      },
      missing,
    },
    requests: asked,
  }
}
