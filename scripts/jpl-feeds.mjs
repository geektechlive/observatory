// The planets, Sentry and fireball feeds for scripts/refresh-data.mjs (#146). They were
// Pages Functions that called JPL on a cache miss, so two visitors (or a visitor and a
// lookup) could overlap, which JPL's Fair Use and Horizons' 503s forbid (#88). Built here
// they are three finished bodies in KV that the Functions only pass through.
//
// Every request goes through one paced queue, one at a time, and the step runs after the
// dwarf planets in refresh-data.mjs, never beside another JPL step. The three feeds fail
// separately, and the planets go last: they are nine requests to the host that refuses
// overlap, so a Horizons outage is the one that can burn the step's budget.
import { parseHorizons } from '../src/lib/horizons.ts'
import { BudgetExceeded } from './orrery-bodies.mjs'

const HORIZONS = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const SENTRY_API = 'https://ssd-api.jpl.nasa.gov/sentry.api'
const FIREBALL_API = 'https://ssd-api.jpl.nasa.gov/fireball.api?limit=30'

/** Pause before each JPL request (the dwarf step's last one may have just ended). */
const DEFAULT_PAUSE_MS = 1000
/** Eleven requests take 12 s (measured 2026-11-12, see the data-feeds doc). */
export const DEFAULT_BUDGET_MS = 60_000
/** Sentry lists every object (2000+); the panel shows the highest Palermo scale ones. */
const SENTRY_KEEP = 50
const DAY_MS = 86_400_000

/** The bodies /api/planets has always held, Sun first; `id` is the Horizons COMMAND. */
export const PLANET_BODIES = [
  { name: 'Sun', id: '10' },
  { name: 'Moon', id: '301' },
  { name: 'Mercury', id: '199' },
  { name: 'Venus', id: '299' },
  { name: 'Mars', id: '499' },
  { name: 'Jupiter', id: '599' },
  { name: 'Saturn', id: '699' },
  { name: 'Uranus', id: '799' },
  { name: 'Neptune', id: '899' },
]

const reasonOf = (err) => (err instanceof Error ? err.message : String(err))

function ymd(ms) {
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

function planetUrl(id, start, stop) {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: id,
    EPHEM_TYPE: 'OBSERVER',
    CENTER: '500@399',
    START_TIME: start,
    STOP_TIME: stop,
    STEP_SIZE: '1d',
    QUANTITIES: "'1,9,23'",
  })
  return `${HORIZONS}?${params.toString()}`
}

/** One body's position for the day, from Horizons' text table; throws when it can't be read. */
async function planetBody(ask, spec, start, stop) {
  const obs = parseHorizons(await ask('horizons', planetUrl(spec.id, start, stop)))
  if (!obs) throw new Error(`no ephemeris row for ${spec.name}`)
  return {
    name: spec.name,
    raHours: obs.raHours,
    decDeg: obs.decDeg,
    mag: Number.isFinite(obs.mag) ? obs.mag : null,
    elongation: obs.elongation,
  }
}

async function buildPlanets(ask, now) {
  const start = ymd(now)
  const stop = ymd(now + DAY_MS)
  const bodies = []
  const missing = []
  for (const spec of PLANET_BODIES) {
    try {
      bodies.push(await planetBody(ask, spec, start, stop))
    } catch (err) {
      console.warn(`  planets: ${spec.name} failed (${reasonOf(err)})`)
      missing.push(spec.name)
    }
  }
  if (bodies.length === 0) throw new Error('no body could be placed by Horizons')
  return { payload: { bodies, updatedAt: new Date(now).toISOString() }, missing }
}

// ---------------------------------------------------------------- Sentry

const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The Sentry fields the client schema (src/schemas/sentry.ts) knows, and their kinds. */
const SENTRY_FIELDS = {
  des: 'string',
  name: 'string',
  fullname: 'string',
  ps_cum: 'string',
  ps_max: 'string',
  ip: 'string',
  n_imp: 'number',
  diameter: 'string|null',
  v_inf: 'string',
  h: 'string',
  range: 'string',
  epoch: 'string',
}

function fieldOk(kind, value) {
  if (kind === 'string|null') return value === null || typeof value === 'string'
  return typeof value === kind
}

/** The known fields of one Sentry object; throws when one is the wrong kind (schema drift). */
function sentryObject(raw) {
  if (!isRecord(raw)) throw new Error('Sentry object is not an object')
  const out = {}
  for (const [key, kind] of Object.entries(SENTRY_FIELDS)) {
    const value = raw[key]
    if (value === undefined) continue
    if (!fieldOk(kind, value)) throw new Error(`Sentry field ${key} is not ${kind}`)
    out[key] = value
  }
  if (out.des === undefined) throw new Error('Sentry object has no des')
  return out
}

const palermo = (o) => Number.parseFloat(o.ps_cum ?? '') || -Infinity

async function buildSentry(ask, now) {
  const raw = await ask('json', SENTRY_API)
  if (!isRecord(raw) || typeof raw.count !== 'string' || !Array.isArray(raw.data)) {
    throw new Error('Sentry answer has no count and data')
  }
  if (raw.data.length === 0) throw new Error('Sentry answer lists no objects')
  const top = raw.data
    .map(sentryObject)
    .sort((a, b) => palermo(b) - palermo(a))
    .slice(0, SENTRY_KEEP)
  return { payload: { count: raw.count, data: top, updatedAt: new Date(now).toISOString() } }
}

// ---------------------------------------------------------------- fireball

function fireballRows(fields, rows) {
  const idx = (name) => fields.indexOf(name)
  const cell = (row, name) => {
    const v = row[idx(name)]
    return typeof v === 'string' ? v : null
  }
  return rows.map((row) => {
    const date = cell(row, 'date')
    if (!date) throw new Error('Fireball row has no date')
    return {
      date,
      energy: cell(row, 'energy'),
      impactE: cell(row, 'impact-e'),
      lat: cell(row, 'lat'),
      latDir: cell(row, 'lat-dir'),
      lon: cell(row, 'lon'),
      lonDir: cell(row, 'lon-dir'),
      alt: cell(row, 'alt'),
      vel: cell(row, 'vel'),
    }
  })
}

async function buildFireball(ask, now) {
  const raw = await ask('json', FIREBALL_API)
  if (!isRecord(raw) || !Array.isArray(raw.fields) || !Array.isArray(raw.data)) {
    throw new Error('Fireball answer has no fields and data')
  }
  if (raw.data.length === 0) throw new Error('Fireball answer lists no events')
  if (!raw.data.every(Array.isArray)) throw new Error('Fireball rows are not arrays')
  const data = fireballRows(raw.fields, raw.data)
  const count = typeof raw.count === 'string' ? raw.count : String(data.length)
  return { payload: { count, data, updatedAt: new Date(now).toISOString() } }
}

// ---------------------------------------------------------------- the step

/**
 * Build the three bodies. Each result is `{ payload, ... }` or `{ error }`; nothing
 * throws, so the caller judges each feed by the age of the copy it would replace.
 * `fetchHorizonsText(url)` returns Horizons' result text and `fetchJson(url)` the parsed
 * JSON; both are asked one at a time with `pauseMs` between, inside `budgetMs`.
 */
export async function buildJplFeeds({
  now = Date.now(),
  fetchHorizonsText,
  fetchJson,
  pauseMs = DEFAULT_PAUSE_MS,
  budgetMs = DEFAULT_BUDGET_MS,
  clock = Date.now,
}) {
  const began = clock()
  let requests = 0
  const ask = async (kind, url) => {
    if (clock() - began > budgetMs) throw new BudgetExceeded('time budget spent')
    if (requests > 0 && pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs))
    requests += 1
    return kind === 'horizons' ? fetchHorizonsText(url) : fetchJson(url)
  }
  const attempt = async (label, build) => {
    try {
      return await build(ask, now)
    } catch (err) {
      return { error: `${label}: ${reasonOf(err)}` }
    }
  }
  // The two single requests first: a Horizons outage, where every body burns its retries
  // (up to 80 s each), then costs only the planets, never the other two feeds.
  const sentry = await attempt('sentry', buildSentry)
  const fireball = await attempt('fireball', buildFireball)
  const planets = await attempt('planets', buildPlanets)
  return { planets, sentry, fireball, requests }
}
