// The orrery's dwarf planets for scripts/refresh-data.mjs (#99 item 8): Pluto, Ceres,
// Eris, Makemake and Haumea, one coarse Horizons span each, positions only; and Pluto's
// moon Charon, a fine span around now from the Pluto barycentre. Built here so
// the Pages Function only passes the finished body through (10 ms CPU). Its own KV key
// (horizons:dwarfs:v1), not the comets', so the Tonight panel never downloads them.
//
// JPL's Fair Use asks for "only one API request at a time", so every request goes through
// one paced queue, and the step runs after the comet step in refresh-data.mjs, never
// beside it.
import { CHARON, DWARFS, dwarfWindowJd } from '../src/lib/orrery/dwarfs.ts'
import { moonStepDays, moonWindowDays } from '../src/lib/orrery/moons.ts'
import { BudgetExceeded, fetchSpan, jdFromMs, toSpan } from './orrery-bodies.mjs'

const DAY_MS = 86_400_000
/** Reuse the spans while they are younger than this. */
const COARSE_MAX_AGE_MS = DAY_MS
/** Pause before each JPL request (the comet step's last one may have just ended). */
const DEFAULT_PAUSE_MS = 1000
/** Six requests (the five and Charon) take about 11 s (measured 2026-11-12); a minute is plenty. */
export const DEFAULT_BUDGET_MS = 60_000
/** 1e-6 au (150 km) is far below a pixel at any dwarf planet's scale, and a third smaller. */
const DWARF_DECIMALS = 6

const reasonOf = (err) => (err instanceof Error ? err.message : String(err))

/**
 * Build the /api/orrery-dwarfs payload. `previous` is the last payload: a body's span is
 * reused while that copy's spans are under a day old, decided per body. A body that fails
 * keeps its last span, if any (its ephemeris does not go stale in hours), and is listed in
 * `missing`; the step fails only when no body could be placed at all.
 */
export async function buildOrreryDwarfs({
  now = Date.now(),
  fetchHorizonsText,
  pauseMs = DEFAULT_PAUSE_MS,
  budgetMs = DEFAULT_BUDGET_MS,
  clock = Date.now,
  previous = null,
}) {
  const began = clock()
  let asked = 0
  const ask = async (url) => {
    if (clock() - began > budgetMs) throw new BudgetExceeded('time budget spent')
    if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs))
    asked += 1
    return fetchHorizonsText(url)
  }
  const prevAt = previous?.coarseFetchedAt ? Date.parse(previous.coarseFetchedAt) : Number.NaN
  const reuse = Number.isFinite(prevAt) && now - prevAt < COARSE_MAX_AGE_MS
  const prevById = new Map((previous?.dwarfs ?? []).map((d) => [d.id, d]))
  // A body the last run could not fetch is asked again now, not a day later.
  const prevMissing = new Set((previous?.missing ?? []).map((m) => m.id))

  const dwarfs = []
  const missing = []
  for (const spec of DWARFS) {
    const id = `sb:${spec.spkid}`
    const prev = prevById.get(id)
    if (reuse && prev?.coarse && !prevMissing.has(id)) {
      dwarfs.push(prev)
      continue
    }
    try {
      const { startJd, stopJd } = dwarfWindowJd(spec)
      const got = await fetchSpan(
        { naifId: spec.command, command: spec.command, targetOk: (t) => t === spec.target },
        startJd,
        stopJd,
        spec.stepDays,
        ask,
        now,
      )
      if (!got.samples) throw new Error('no samples in the window')
      dwarfs.push({
        id,
        spkid: spec.spkid,
        name: spec.name,
        target: got.target,
        availableFrom: got.availableFrom,
        availableTo: got.availableTo,
        coarse: toSpan(got.samples, false, DWARF_DECIMALS),
      })
    } catch (err) {
      missing.push({ id, reason: reasonOf(err) })
      if (prev?.coarse) dwarfs.push(prev)
    }
  }
  if (dwarfs.length === 0) {
    throw new Error(`no dwarf planet could be placed: ${missing.map((m) => m.reason).join('; ')}`)
  }
  const charon = await charonSpan({ now, ask, previous, reuse, prevMissing, missing })
  return {
    payload: {
      generatedAt: new Date(now).toISOString(),
      coarseFetchedAt: reuse ? previous.coarseFetchedAt : new Date(now).toISOString(),
      frame: 'ecliptic-J2000',
      center: 'Sun',
      timeScale: 'TDB',
      units: { position: 'au' },
      sourceType: 'ephemeris',
      provider: 'jpl-horizons',
      dwarfs,
      charon,
      missing,
    },
    requests: asked,
  }
}

/** Charon's span is refetched, even inside the day's reuse, once fewer days than this remain ahead. */
const CHARON_MIN_DAYS_AHEAD = 7

/** Days a span's samples reach past `now` (positions and velocities, 6 per sample). */
function daysAhead(span, now) {
  const last = span.start + (Math.floor(span.samples.length / 6) - 1) * span.step
  return last - jdFromMs(now)
}

/**
 * Charon (#99): a fine span relative to the Pluto barycentre (500@9), the point Pluto's
 * marker stands for, over the moons' window around now at their step (moons.ts: ±15
 * days, 6 h). Reused with the dwarf planets' spans unless fewer than CHARON_MIN_DAYS_AHEAD
 * remain ahead; one that fails keeps its last copy,
 * is listed in `missing` and never fails the step.
 */
async function charonSpan({ now, ask, previous, reuse, prevMissing, missing }) {
  const id = `naif:${CHARON.naifId}`
  const prev = previous?.charon?.fine ? previous.charon : null
  if (reuse && prev && !prevMissing.has(id) && daysAhead(prev.fine, now) >= CHARON_MIN_DAYS_AHEAD) {
    return prev
  }
  try {
    const days = moonWindowDays(CHARON.periodDays)
    const startJd = jdFromMs(Math.floor((now - days * DAY_MS) / DAY_MS) * DAY_MS)
    const got = await fetchSpan(
      {
        naifId: CHARON.naifId,
        command: CHARON.command,
        center: CHARON.center,
        targetOk: (t) => t === CHARON.target,
      },
      startJd,
      startJd + 2 * days,
      moonStepDays(CHARON.periodDays),
      ask,
      now,
    )
    if (!got.samples) throw new Error('no samples in the window')
    return {
      id,
      naifId: CHARON.naifId,
      name: CHARON.name,
      parentSpkid: CHARON.parentSpkid,
      center: `500@${CHARON.center}`,
      target: got.target,
      fine: toSpan(got.samples, true),
    }
  } catch (err) {
    missing.push({ id, reason: reasonOf(err) })
    return prev
  }
}
