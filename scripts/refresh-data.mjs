#!/usr/bin/env node
// Refresh the durable Workers KV snapshots that back /api/iss-tle, /api/satellites,
// /api/launches and /api/apod (APOD from science.nasa.gov, #72: too big a page to
// parse inside the Worker's 10 ms CPU budget), and /api/orrery-bodies (#93: craft,
// Earth and Moon from JPL Horizons, which refuses overlapping requests, so it is asked
// here one request at a time, never on the request path; see orrery-bodies.mjs), and
// /api/orrery-neo (#92: close approaches placed with Horizons, JPL Scout and ESA NEOCC;
// see orrery-neo.mjs), and /api/orrery-smallbodies (#99: comets and the interstellar
// objects; see orrery-smallbodies.mjs), and /api/orrery-dwarfs (#99 item 8: the dwarf
// planets, a key of their own; see orrery-dwarfs.mjs), and /api/spacetrack (#101: re-entries, the
// satellite catalogue, the Box Score and a few objects' element history from
// Space-Track.org, with the owner's account; see spacetrack.mjs).
//
// Why this exists: CelesTrak returns HTTP 522 to Cloudflare Workers egress (observed
// from about 2026-09-03), so the Pages Functions cannot fetch TLEs themselves. An
// ordinary network (a GitHub Actions runner, a laptop) gets a clean 200. This script
// runs there, validates the data, and writes it to KV over the Cloudflare REST API.
// The handlers only ever read KV, which keeps request-path KV writes at zero.
//
// A failed source is only an incident once the KV copy it would have replaced is
// older than that source's max age: the Functions keep serving the last good copy,
// so one missed run (CelesTrak blips from GitHub runners every week or two) is not
// worth a page. Every outcome goes to incident-report.json for report-incidents.mjs.
//
// Usage:
//   node scripts/refresh-data.mjs            fetch, validate, write to KV
//   node scripts/refresh-data.mjs --dry-run  fetch and validate only, no credentials needed
//   ... --dry-run --only=orrery-bodies --bodies-out=/tmp/bodies.json
//                                            just the orrery step, payload saved locally
//   ... --dry-run --only=orrery-neo --neo-out=/tmp/neo.json
//                                            just the close-approach step (#92)
//   ... --dry-run --only=orrery-smallbodies --smallbodies-out=/tmp/sb.json
//                                            just the comets and interstellar objects (#99)
//   ... --dry-run --only=orrery-dwarfs --dwarfs-out=/tmp/dwarfs.json
//                                            just the dwarf planets (#99 item 8)
//   ... --dry-run --only=celestrak-groups    just the orrery's satellite groups (#98)
//   ... --sats-out=dir                       with it, save each group's body and the raw
//                                            Starlink SupGP answer (#209) in dir
//   ... --dry-run --only=spacetrack --spacetrack-out=/tmp/st.json
//                                            just Space-Track (#101); needs SPACETRACK_USER
//                                            and SPACETRACK_PASS, else it is skipped;
//                                            DISCOSweb runs after it (--discos-out=path),
//                                            or alone with --only=discos (DISCOSWEB_TOKEN)
//
// Env (write mode only):
//   CLOUDFLARE_API_TOKEN   token with "Workers KV Storage: Edit" on the account
//   CLOUDFLARE_ACCOUNT_ID  account that owns the namespace
//   KV_NAMESPACE_ID        optional override, defaults to the observatory namespace
// Env (any mode, optional):
//   SPACETRACK_USER, SPACETRACK_PASS  the Space-Track.org account (#101); never logged
//   DISCOSWEB_TOKEN                   the ESA DISCOSweb token (#101); never logged

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  createCelestrakGate,
  refreshSatGroups,
  SUPGP_TIMEOUT_MS,
} from './celestrak-groups.mjs'
import { buildOrreryBodies, DEFAULT_BUDGET_MS as BODIES_BUDGET_MS } from './orrery-bodies.mjs'
import { buildOrreryNeo, DEFAULT_BUDGET_MS as NEO_BUDGET_MS } from './orrery-neo.mjs'
import {
  buildOrrerySmallBodies,
  DEFAULT_BUDGET_MS as SMALLBODIES_BUDGET_MS,
} from './orrery-smallbodies.mjs'
import { buildCometsTonight } from './comets-tonight.mjs'
import { buildOrreryDwarfs, DEFAULT_BUDGET_MS as DWARFS_BUDGET_MS } from './orrery-dwarfs.mjs'
import { HISTORY_OBJECTS } from '../src/lib/spacetrack.ts'
import { buildDiscos, discosToken } from './discos.mjs'
import {
  buildSpaceTrack,
  DEFAULT_BUDGET_MS as SPACETRACK_BUDGET_MS,
  satcatShards,
  spaceTrackCredentials,
} from './spacetrack.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')

const DEFAULT_KV_NAMESPACE_ID = 'cf6fe79d1a254877937edb081d768fed'
const CF_API_BASE = 'https://api.cloudflare.com/client/v4'

const ISS_CATNR = 25544
const CELESTRAK_TLE = (catnr) =>
  `https://celestrak.org/NORAD/elements/gp.php?CATNR=${catnr}&FORMAT=TLE`
const RLL_URL = 'https://fdo.rocketlaunch.live/json/launches/next/5'

const KEY_ISS = 'tle:iss:v1'
const KEY_SATELLITES = 'tle:satellites:v1'
const KEY_LAUNCHES_BACKUP = 'rll:launches:next:v1:backup'
const KEY_APOD = 'apod:science:v1'
/** The orrery's craft, Earth and Moon (#93): a finished body, with metadata. */
export const KEY_ORRERY_BODIES = 'horizons:bodies:v1'
const ORRERY_SIGNATURE = 'refresh:orrery-bodies'
/** /api/orrery-bodies serves a copy up to 72 h old before calling it degraded. */
const ORRERY_MAX_AGE_MS = 72 * 3_600_000
/** The orrery's close approaches, Scout and NEOCC (#92): a finished body, with metadata. */
export const KEY_ORRERY_NEO = 'horizons:neo:v1'
const NEO_SIGNATURE = 'refresh:orrery-neo'
/** The approach list changes daily; /api/orrery-neo calls a copy degraded past 36 h. */
const NEO_MAX_AGE_MS = 36 * 3_600_000
/** The orrery's comets and interstellar objects (#99): a finished body, with metadata. */
export const KEY_ORRERY_SMALLBODIES = 'horizons:smallbodies:v1'
const SMALLBODIES_SIGNATURE = 'refresh:orrery-smallbodies'
/** Spans run 30 days either side, so /api/orrery-smallbodies serves a copy up to 72 h old. */
const SMALLBODIES_MAX_AGE_MS = 72 * 3_600_000
/** The Tonight panel's comets (#135): a week of spans cut from the comet body, its own key. */
export const KEY_COMETS_TONIGHT = 'horizons:comets-tonight:v1'
/** The orrery's dwarf planets (#99 item 8): their own key, so the comets stay small. */
export const KEY_ORRERY_DWARFS = 'horizons:dwarfs:v1'
const DWARFS_SIGNATURE = 'refresh:orrery-dwarfs'
/** Rewritten every run (spans reused for a day), so a copy past 72 h means refreshes failed. */
const DWARFS_MAX_AGE_MS = 72 * 3_600_000
/** Space-Track (#101): re-entries, recent decays, the Box Score; see spacetrack.mjs. */
export const KEY_SPACETRACK_CATALOG = 'spacetrack:catalog:v1'
/** GP_HISTORY element sets, each month asked once ever; rewritten only when it grows. */
export const KEY_SPACETRACK_HISTORY = 'spacetrack:history:v1'
/** SATCAT, in shards by NORAD id, rewritten once a day. */
export const SPACETRACK_SATCAT_KEY = (shard) => `spacetrack:satcat:v1:${String(shard)}`
const SPACETRACK_SIGNATURE = 'refresh:spacetrack'
/** TIP is asked every run; /api/spacetrack calls a catalogue past 36 h degraded. */
const SPACETRACK_MAX_AGE_MS = 36 * 3_600_000
/** ESA DISCOSweb (#101): mass, size and operator; see discos.mjs. */
export const KEY_DISCOS = 'discos:objects:v1'
const DISCOS_SIGNATURE = 'refresh:discos'
/** Each object is asked weekly, so a copy is sound for a fortnight. */
const DISCOS_MAX_AGE_MS = 14 * 86_400_000
const APOD_INDEX = 'https://science.nasa.gov/apod/'

const FETCH_TIMEOUT_MS = 20_000
const FETCH_RETRIES = 3

/**
 * The whole job's time (#128). data-refresh.yml kills the job at timeout-minutes, and
 * a killed job writes no incident report, so its failures would go unreported. Every
 * step draws from this one deadline: the JPL steps' own budgets (4, 2 and 1.5 min)
 * are capped by what is left of it, and nothing starts a new fetch once it has passed.
 * A source cut short ships what it has or is judged by its KV copy's age, as on any
 * other failure. The step took 2 min 13 s on 2026-11-07 (run 42385111275).
 */
export const JOB_DEADLINE_MS = 6 * 60_000
/**
 * The longest one fetch can still run once the deadline passes (100 s). It was sized
 * for CelesTrak's old first try plus a fetchWithRetry; since #212 a CelesTrak request
 * is one try (20 s for a TLE, 30 s for a group, SupGP capped by stepBudget), and the
 * longest fetch is one fetchWithRetry: three 20 s attempts and its 5 s and 15 s waits
 * (80 s, a Horizons, launches or APOD fetch). The 100 s is kept as margin.
 */
export const WORST_FETCH_MS = FETCH_TIMEOUT_MS + FETCH_RETRIES * FETCH_TIMEOUT_MS + 5_000 + 15_000
/**
 * Checkout, setup-node, the KV writes and the reporter. On 2026-11-07 they took
 * 5 s, about 1 s and 1 s; the KV calls have no deadline of their own beyond their
 * 20 s timeouts, so this is margin for normal runs, not a bound on a broken KV API.
 */
export const RUN_MARGIN_MS = 60_000
const TLE_LINE_LENGTH = 69
const HOUR_MS = 3_600_000
const PAYLOAD_EXCERPT_CHARS = 300
/** Where the per-source results go for scripts/report-incidents.mjs. */
const REPORT_PATH = process.env.INCIDENT_REPORT ?? 'incident-report.json'

// Mirror of the SATS list in functions/api/satellites.ts. Only used when the regex
// extraction below fails (file moved, formatting changed). The TS file stays the
// source of truth.
const FALLBACK_SATS = [
  { label: 'Hubble', catnr: 20580 },
  { label: 'Tiangong', catnr: 48274 },
]

// ---------------------------------------------------------------- pure helpers

/**
 * TLE line checksum: sum the digits, count every "-" as 1, ignore everything else,
 * over the first 68 characters. The result mod 10 must equal the 69th character.
 */
export function tleChecksumOk(line) {
  if (typeof line !== 'string' || line.length !== TLE_LINE_LENGTH) return false
  let sum = 0
  for (let i = 0; i < TLE_LINE_LENGTH - 1; i++) {
    const c = line[i]
    if (c >= '0' && c <= '9') sum += Number(c)
    else if (c === '-') sum += 1
  }
  const expected = line[TLE_LINE_LENGTH - 1]
  return expected >= '0' && expected <= '9' && sum % 10 === Number(expected)
}

/**
 * Parse and fully validate a CelesTrak 3-line TLE block.
 * Returns { name, line1, line2 } or null if anything is off.
 */
export function parseTle(text) {
  if (typeof text !== 'string') return null

  const lines = text
    .trim()
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0)
  if (lines.length !== 3) return null

  const name = lines[0].trim()
  const line1 = lines[1]
  const line2 = lines[2]

  if (name.length === 0) return null
  if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) return null
  if (line1.length !== TLE_LINE_LENGTH || line2.length !== TLE_LINE_LENGTH) return null
  if (!tleChecksumOk(line1) || !tleChecksumOk(line2)) return null

  return { name, line1, line2 }
}

/** Minimal shape check for the RocketLaunch.live payload. */
export function isValidLaunchesPayload(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray(value.result) &&
    typeof value.count === 'number'
  )
}

// APOD (#72). apod.nasa.gov now 301s to science.nasa.gov/apod/, and NASA's APOD API
// still scrapes the old page (2026-10-25: title "NASA Science", the NASA logo as url).
// Each day is an article at /image-article/apod-<year>-<month>-<day>-<slug>/.
const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]
const APOD_ARTICLE =
  /https:\/\/science\.nasa\.gov\/image-article\/apod-(\d{4})-([a-z]+)-(\d{1,2})-[a-z0-9-]+\//g
const APOD_IMAGE_HOST = 'https://assets.science.nasa.gov/'
const MIN_EXPLANATION_CHARS = 50

/** ISO date from an article URL's apod-<year>-<month>-<day> slug, or null. */
function apodSlugDate(url) {
  const m = new RegExp(APOD_ARTICLE.source).exec(url)
  if (!m) return null
  const month = MONTHS.indexOf(m[2])
  if (month < 0) return null
  return `${m[1]}-${String(month + 1).padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

/** The newest APOD article on the index page; its explanation links to older days. */
export function apodArticleUrl(html) {
  let best = null
  for (const [url] of String(html).matchAll(APOD_ARTICLE)) {
    const date = apodSlugDate(url)
    if (date && (!best || date > best.date)) best = { url, date }
  }
  return best?.url ?? null
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] !== '#') return NAMED_ENTITIES[code.toLowerCase()] ?? whole
    const n =
      code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
    return Number.isFinite(n) ? String.fromCodePoint(n) : whole
  })
}

const plainText = (html) =>
  decodeEntities(html.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()

/**
 * An APOD article page in the NASA APOD API's shape, so /api/apod serves either.
 * Throws on anything missing: a page we can't read must never become a stored placeholder.
 */
export function parseApodArticle(html, articleUrl) {
  const date = apodSlugDate(articleUrl)
  if (!date) throw new Error(`no date in APOD article URL ${articleUrl}`)

  const titleHtml = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1]
  const title = titleHtml ? plainText(titleHtml) : ''
  if (!title || title === 'NASA Science') throw new Error('APOD article has no title')

  const image = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1]
  const url = image ? decodeEntities(image) : ''
  if (!url.startsWith(APOD_IMAGE_HOST))
    throw new Error(`APOD article has no image on ${APOD_IMAGE_HOST}`)

  const descHtml = /<p[^>]*media-detail-hero__description[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1]
  const explanation = descHtml ? plainText(descHtml).replace(/^Explanation:\s*/, '') : ''
  if (explanation.length < MIN_EXPLANATION_CHARS) throw new Error('APOD article has no explanation')

  return {
    date,
    title,
    explanation,
    url,
    hdurl: url,
    media_type: 'image',
    service_version: 'science.nasa.gov',
  }
}

/**
 * One-line description of a payload we rejected, for the log and the incident issue:
 * its top-level keys (if it is a JSON object) and the start of the body. On 2026-10-09
 * RLL served something that was not `{result, count}` and we never saw what it was.
 */
export function describePayload(text) {
  const excerpt = String(text).slice(0, PAYLOAD_EXCERPT_CHARS).replace(/\s+/g, ' ')
  let shape
  try {
    const json = JSON.parse(text)
    shape =
      json !== null && typeof json === 'object' && !Array.isArray(json)
        ? `keys=[${Object.keys(json).join(',')}]`
        : `JSON ${Array.isArray(json) ? 'array' : typeof json}`
  } catch {
    shape = 'not JSON'
  }
  return `${shape} body=${JSON.stringify(excerpt)}`
}

/**
 * Decide what a failed source means. KV still holds the last good copy, which the
 * Functions serve; one missed run only matters once that copy is older than the
 * source's max age. `envelopeText` is the current KV value: a string, null when the
 * key is absent, or undefined when it could not be read (dry run, KV error).
 * Returns { ok, detail }: ok=false is an incident.
 */
export function classifyFailure({ err, envelopeText, maxAgeMs, now = Date.now() }) {
  const reason = err instanceof Error ? err.message : String(err)
  const limit = `${String(Math.round(maxAgeMs / HOUR_MS))}h`
  if (envelopeText === undefined) {
    return { ok: false, detail: `FAIL ${reason}; KV copy age unknown` }
  }
  let fetchedAt = Number.NaN
  try {
    fetchedAt = Date.parse(JSON.parse(envelopeText ?? 'null')?.fetchedAt)
  } catch {
    // garbled envelope: treated as missing
  }
  if (!Number.isFinite(fetchedAt)) {
    return { ok: false, detail: `FAIL ${reason}; no usable KV copy` }
  }
  const age = now - fetchedAt
  const ageText = `${String(Math.round(age / HOUR_MS))}h old`
  return age <= maxAgeMs
    ? { ok: true, warning: true, detail: `WARN ${reason}; KV copy ${ageText}, limit ${limit}` }
    : { ok: false, detail: `FAIL ${reason}; KV copy ${ageText}, past ${limit} limit` }
}

// ---------------------------------------------------------------- io helpers

const defaultDelayMs = (attempt) => (attempt === 2 ? 5_000 : 15_000)

/**
 * Fetch `url` and run `validate(text)` on the body, retrying network errors, non-2xx
 * statuses AND validation failures (an upstream that serves a bad body once usually
 * serves a good one seconds later). Returns whatever `validate` returns. A final
 * validation failure carries `describePayload` of the last body.
 */
export async function fetchWithRetry(url, init = {}, opts = {}) {
  const validate = opts.validate ?? ((text) => text)
  const fetchImpl = opts.fetchImpl ?? fetch
  const delayMs = opts.delayMs ?? defaultDelayMs
  const attempts = opts.attempts ?? FETCH_RETRIES

  let lastError = new Error('no attempt made')
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1) {
      const wait = delayMs(attempt)
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    }
    try {
      const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      if (!res.ok) throw new Error(`HTTP ${String(res.status)} from ${url}`)
      const text = await res.text()
      try {
        return validate(text)
      } catch (err) {
        throw new Error(
          `${err instanceof Error ? err.message : String(err)}: ${describePayload(text)}`,
          { cause: err },
        )
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }
  throw lastError
}

/**
 * Read the SATS list out of functions/api/satellites.ts at runtime so the script and
 * the handler cannot drift. Falls back to FALLBACK_SATS if the file or the literal
 * formatting changes.
 */
async function loadSats() {
  const path = resolve(REPO_ROOT, 'functions/api/satellites.ts')
  try {
    const source = await readFile(path, 'utf8')
    const block = source.match(/const SATS[^=]*=\s*\[([\s\S]*?)\]/)
    if (!block) throw new Error('SATS array literal not found')

    const sats = []
    const entry = /\{\s*label:\s*'([^']+)'\s*,\s*catnr:\s*(\d+)\s*\}/g
    let match
    while ((match = entry.exec(block[1])) !== null) {
      sats.push({ label: match[1], catnr: Number(match[2]) })
    }
    if (sats.length === 0) throw new Error('no SATS entries matched')
    return sats
  } catch (err) {
    console.warn(`warn: could not extract SATS from ${path} (${err.message}); using fallback list`)
    return FALLBACK_SATS
  }
}

/**
 * One TLE from CelesTrak GP, through the run's CelesTrak gate (#212): one request, a
 * 200 only, never retried; any other answer stops CelesTrak for the rest of the run.
 */
export async function fetchTle(catnr, celestrak) {
  const text = await celestrak.fetchText(CELESTRAK_TLE(catnr), {
    timeoutMs: FETCH_TIMEOUT_MS,
    label: `CelesTrak TLE ${String(catnr)}`,
  })
  const parsed = parseTle(text)
  if (!parsed) {
    throw new Error(`TLE for CATNR ${String(catnr)} failed validation: ${describePayload(text)}`)
  }
  return parsed
}

function fetchLaunches() {
  return fetchWithRetry(
    RLL_URL,
    { headers: { Accept: 'application/json' } },
    {
      validate: (text) => {
        const json = JSON.parse(text)
        if (!isValidLaunchesPayload(json)) throw new Error('unexpected RLL payload shape')
        return json
      },
    },
  )
}

async function fetchApod() {
  const html = { headers: { Accept: 'text/html' } }
  const articleUrl = await fetchWithRetry(APOD_INDEX, html, {
    validate: (text) => {
      const url = apodArticleUrl(text)
      if (!url) throw new Error('no APOD article link on the index page')
      return url
    },
  })
  return fetchWithRetry(articleUrl, html, {
    validate: (text) => parseApodArticle(text, articleUrl),
  })
}

function envelope(source, data) {
  return JSON.stringify({ fetchedAt: new Date().toISOString(), source, data })
}

function kvUrl(key, config) {
  return `${CF_API_BASE}/accounts/${config.accountId}/storage/kv/namespaces/${config.namespaceId}/values/${encodeURIComponent(key)}`
}

/**
 * The PUT for a KV write. With `metadata`, the REST API's multipart form: one write
 * stores both, and the Function reads them together with getWithMetadata (#93), so a
 * value it passes through unparsed still says how old it is.
 */
export function kvPutInit(value, metadata, token) {
  const headers = { Authorization: `Bearer ${token}` }
  if (metadata === undefined) {
    return { method: 'PUT', headers: { ...headers, 'Content-Type': 'text/plain' }, body: value }
  }
  const form = new FormData()
  form.append('value', value)
  form.append('metadata', JSON.stringify(metadata))
  return { method: 'PUT', headers, body: form }
}

async function putKv(key, value, config, metadata) {
  const res = await fetch(kvUrl(key, config), {
    ...kvPutInit(value, metadata, config.token),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`KV PUT ${key} failed: HTTP ${res.status} ${body.slice(0, 300)}`)
  console.log(`  wrote ${key} (${value.length} bytes)`)
}

/** Current KV value: the text, null when absent, undefined when it could not be read. */
async function readKv(key, config) {
  if (!config) return undefined
  try {
    const res = await fetch(kvUrl(key, config), {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`HTTP ${String(res.status)}`)
    return await res.text()
  } catch (err) {
    console.warn(`warn: could not read ${key} from KV (${err.message})`)
    return undefined
  }
}

function readConfig() {
  const token = process.env.CLOUDFLARE_API_TOKEN
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const namespaceId = process.env.KV_NAMESPACE_ID ?? DEFAULT_KV_NAMESPACE_ID

  const missing = []
  if (!token) missing.push('CLOUDFLARE_API_TOKEN')
  if (!accountId) missing.push('CLOUDFLARE_ACCOUNT_ID')
  if (missing.length > 0) {
    throw new Error(`missing required env: ${missing.join(', ')}`)
  }
  return { token, accountId, namespaceId }
}

// ---------------------------------------------------------------- job deadline (#128)

/** The job's deadline, counted from now. */
export function createDeadline({ budgetMs = JOB_DEADLINE_MS, clock = Date.now } = {}) {
  const ends = clock() + budgetMs
  return {
    remaining: () => ends - clock(),
    passed: () => clock() >= ends,
  }
}

/**
 * A JPL step's budget: its own, or what is left of the job's if less. Past the
 * deadline it is negative, because the steps stop when elapsed > budget and elapsed
 * starts at 0: a budget of 0 would still let one request through.
 */
export function stepBudget(ownMs, deadline) {
  const left = deadline.remaining()
  return left <= 0 ? -1 : Math.min(ownMs, left)
}

/** `fetch`, refused once the deadline has passed (the caller then judges by KV age). */
export function beforeDeadline(fetch, deadline) {
  return (...args) => {
    // `asked: false`: nothing was sent, so it neither counts as a request nor, for
    // CelesTrak, stops the run (#212).
    if (deadline.passed()) {
      return Promise.reject(
        Object.assign(new Error('job deadline reached (#128)'), { asked: false }),
      )
    }
    return fetch(...args)
  }
}

/** The optional budget and clock a JPL step was given, for its build function. */
function budgetDeps(deps) {
  return {
    ...(deps.budgetMs === undefined ? {} : { budgetMs: deps.budgetMs }),
    ...(deps.clock === undefined ? {} : { clock: deps.clock }),
  }
}

/** A dry run's satellite bodies and the raw SupGP answer, saved locally (#209); never KV. */
async function saveSatsDryRun(dir, satWrites, supText) {
  await mkdir(dir, { recursive: true })
  for (const write of satWrites) {
    const file = resolve(dir, `${write.key.replaceAll(':', '_')}.json`)
    await writeFile(file, write.value)
    console.log(`  saved ${write.key} to ${file} (${String(write.value.length)} bytes)`)
  }
  if (supText !== null) {
    await writeFile(resolve(dir, 'supgp-starlink-raw.json'), supText)
    console.log(`  saved the raw SupGP answer (${String(supText.length)} bytes)`)
  }
}

// ---------------------------------------------------------------- main

/** Fetch every tracked satellite; fails only if none validate. */
async function fetchSatellites(deadline, celestrak) {
  const records = []
  for (const sat of await loadSats()) {
    if (deadline?.passed()) {
      console.error(`FAIL sat     stopped at ${sat.label}: job deadline reached (#128)`)
      break
    }
    if (celestrak.stoppedBy() !== null) {
      console.error(`FAIL sat     stopped at ${sat.label}: CelesTrak stopped this run (#212)`)
      break
    }
    try {
      const tle = await fetchTle(sat.catnr, celestrak)
      records.push({ label: sat.label, catnr: sat.catnr, ...tle })
      console.log(`ok  sat     ${sat.label} (${String(sat.catnr)})`)
    } catch (err) {
      console.error(`FAIL sat     ${sat.label} (${String(sat.catnr)}): ${err.message}`)
    }
  }
  if (records.length === 0) {
    const stoppedBy = celestrak.stoppedBy()
    throw new Error(
      stoppedBy === null
        ? 'no satellite TLEs validated'
        : `no satellite TLEs: CelesTrak stopped this run after ${stoppedBy}`,
    )
  }
  return records
}

const SOURCES = [
  {
    signature: 'refresh:iss',
    key: KEY_ISS,
    maxAgeMs: 36 * HOUR_MS,
    source: 'celestrak',
    fetch: (_deadline, celestrak) => fetchTle(ISS_CATNR, celestrak),
    summary: (iss) => `${iss.name} epoch ${iss.line1.slice(18, 32)}`,
  },
  {
    signature: 'refresh:satellites',
    key: KEY_SATELLITES,
    maxAgeMs: 36 * HOUR_MS,
    source: 'celestrak',
    fetch: fetchSatellites,
    summary: (records) => `${String(records.length)} satellite(s)`,
  },
  {
    signature: 'refresh:launches',
    key: KEY_LAUNCHES_BACKUP,
    maxAgeMs: 48 * HOUR_MS,
    source: 'rocketlaunch.live',
    fetch: fetchLaunches,
    summary: (json) => `${String(json.result.length)} upcoming`,
  },
  {
    signature: 'refresh:apod',
    key: KEY_APOD,
    // A day and a half: /api/apod falls back to NASA's API and then this copy meanwhile.
    maxAgeMs: 36 * HOUR_MS,
    source: 'science.nasa.gov',
    fetch: fetchApod,
    summary: (apod) => `${apod.date} ${apod.title}`,
  },
]

async function refreshSource(spec, config, deadline, celestrak) {
  try {
    const data = await beforeDeadline(spec.fetch, deadline)(deadline, celestrak)
    const detail = `ok ${spec.signature} ${spec.summary(data)}`
    console.log(detail)
    return {
      entry: { signature: spec.signature, ok: true, detail },
      write: envelope(spec.source, data),
    }
  } catch (err) {
    const envelopeText = await readKv(spec.key, config)
    const verdict = classifyFailure({ err, envelopeText, maxAgeMs: spec.maxAgeMs })
    const detail = `${spec.signature} ${verdict.detail}`
    ;(verdict.ok ? console.warn : console.error)(detail)
    return { entry: { ...verdict, signature: spec.signature, detail } }
  }
}

/** A KV value as JSON, or null when absent, unreadable or not JSON. */
function parseJsonOrNull(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Horizons answers 200 with a JSON envelope whose `result` is the text table. */
function fetchHorizonsText(url) {
  return fetchWithRetry(
    url,
    { headers: { Accept: 'application/json' } },
    {
      validate: (text) => {
        const json = JSON.parse(text)
        if (typeof json?.result !== 'string') throw new Error('Horizons answer has no result')
        return json.result
      },
    },
  )
}

/**
 * The orrery's bodies (#93): one finished body plus metadata in a single KV write. A
 * partial refresh still ships (missing objects are listed in it); only a refresh that
 * got nothing at all is a failure, judged by the age of the copy it would replace.
 */
export async function refreshOrreryBodies(config, deps = {}) {
  const now = deps.now ?? Date.now()
  const previousText = deps.previousText ?? (await readKv(KEY_ORRERY_BODIES, config))
  const previous = parseJsonOrNull(previousText)
  try {
    const { payload, requests } = await buildOrreryBodies({
      now,
      fetchText: deps.fetchText ?? fetchHorizonsText,
      previous,
      ...(deps.pauseMs === undefined ? {} : { pauseMs: deps.pauseMs }),
      ...budgetDeps(deps),
    })
    if (payload.bodies.length === 0) throw new Error('Horizons returned no bodies')
    const missing = payload.missing.map((m) => `${m.id} (${m.reason})`)
    const detail =
      `ok ${ORRERY_SIGNATURE} ${String(payload.bodies.length)} bodies, ` +
      `${String(payload.moons.length)} moons, ${String(requests)} requests` +
      (missing.length ? `; WARN missing ${missing.join(', ')}` : '')
    console.log(detail)
    const value = JSON.stringify(payload)
    return {
      entry: { signature: ORRERY_SIGNATURE, ok: true, warning: missing.length > 0, detail },
      write: {
        key: KEY_ORRERY_BODIES,
        value,
        metadata: {
          fetchedAt: payload.generatedAt,
          bodies: payload.bodies.length,
          moons: payload.moons.length,
          missing: payload.missing.length,
        },
      },
    }
  } catch (err) {
    const verdict = classifyFailure({
      err,
      envelopeText: previous ? JSON.stringify({ fetchedAt: previous.generatedAt }) : previousText,
      maxAgeMs: ORRERY_MAX_AGE_MS,
      now,
    })
    const detail = `${ORRERY_SIGNATURE} ${verdict.detail}`
    ;(verdict.ok ? console.warn : console.error)(detail)
    return { entry: { ...verdict, signature: ORRERY_SIGNATURE, detail } }
  }
}

/** JPL's SSD APIs (CAD, Scout) answer JSON. */
function fetchJplJson(url) {
  return fetchWithRetry(url, { headers: { Accept: 'application/json' } }, { validate: JSON.parse })
}

/** ESA NEOCC's flat files are plain text. */
function fetchNeoccText(url) {
  return fetchWithRetry(url, { headers: { Accept: 'text/plain' } })
}

/**
 * The orrery's close approaches (#92): one finished body plus metadata in one KV write,
 * like the craft. Scout, NEOCC or single asteroids that fail ship as a warning; only a
 * CAD failure is a failure, judged by the age of the copy it would replace.
 */
export async function refreshOrreryNeo(config, deps = {}) {
  const now = deps.now ?? Date.now()
  const previousText = deps.previousText ?? (await readKv(KEY_ORRERY_NEO, config))
  try {
    const { payload, requests } = await buildOrreryNeo({
      now,
      fetchJplJson: deps.fetchJplJson ?? fetchJplJson,
      fetchHorizonsText: deps.fetchHorizonsText ?? fetchHorizonsText,
      fetchNeoccText: deps.fetchNeoccText ?? fetchNeoccText,
      ...(deps.pauseMs === undefined ? {} : { pauseMs: deps.pauseMs }),
      ...budgetDeps(deps),
    })
    const placed = payload.approaches.filter((a) => a.fine !== null).length
    const missing = payload.missing.map((m) => `${m.id} (${m.reason})`)
    const detail =
      `ok ${NEO_SIGNATURE} ${String(payload.approaches.length)} approaches, ` +
      `${String(placed)} placed, ${String(requests)} JPL requests` +
      (missing.length ? `; WARN missing ${missing.join(', ')}` : '')
    console.log(detail)
    return {
      entry: { signature: NEO_SIGNATURE, ok: true, warning: missing.length > 0, detail },
      write: {
        key: KEY_ORRERY_NEO,
        value: JSON.stringify(payload),
        metadata: {
          fetchedAt: payload.generatedAt,
          approaches: payload.approaches.length,
          placed,
          scout: payload.scout?.objects.length ?? 0,
          missing: payload.missing.length,
        },
      },
    }
  } catch (err) {
    const previous = parseJsonOrNull(previousText)
    const verdict = classifyFailure({
      err,
      envelopeText: previous ? JSON.stringify({ fetchedAt: previous.generatedAt }) : previousText,
      maxAgeMs: NEO_MAX_AGE_MS,
      now,
    })
    const detail = `${NEO_SIGNATURE} ${verdict.detail}`
    ;(verdict.ok ? console.warn : console.error)(detail)
    return { entry: { ...verdict, signature: NEO_SIGNATURE, detail } }
  }
}

/**
 * The orrery's comets and interstellar objects (#99): one finished body plus metadata
 * in one KV write, like the craft. The last copy is read back so the interstellar
 * objects' long spans are reused for a day. A failure is judged by the copy's age.
 * `tonightWrite` is the Tonight panel's slice of the same body (#135), a second KV write,
 * so the panel downloads a few kB instead of the whole payload; it is written only with
 * the body it was cut from, so the two never disagree.
 */
export async function refreshOrrerySmallBodies(config, deps = {}) {
  const now = deps.now ?? Date.now()
  const previousText = deps.previousText ?? (await readKv(KEY_ORRERY_SMALLBODIES, config))
  const previous = parseJsonOrNull(previousText)
  try {
    const { payload, requests } = await buildOrrerySmallBodies({
      now,
      fetchJplJson: deps.fetchJplJson ?? fetchJplJson,
      fetchHorizonsText: deps.fetchHorizonsText ?? fetchHorizonsText,
      previous,
      ...(deps.pauseMs === undefined ? {} : { pauseMs: deps.pauseMs }),
      ...budgetDeps(deps),
    })
    const all = [...payload.comets, ...payload.interstellar]
    const placed = all.filter((b) => b.fine !== null || b.coarse !== null).length
    const missing = payload.missing.map((m) => `${m.id} (${m.reason})`)
    const detail =
      `ok ${SMALLBODIES_SIGNATURE} ${String(payload.comets.length)} comets, ` +
      `${String(payload.interstellar.length)} interstellar, ${String(placed)} placed, ` +
      `${String(requests)} JPL requests` +
      (missing.length ? `; WARN missing ${missing.join(', ')}` : '')
    console.log(detail)
    const tonight = buildCometsTonight(payload)
    return {
      entry: { signature: SMALLBODIES_SIGNATURE, ok: true, warning: missing.length > 0, detail },
      tonightWrite: {
        key: KEY_COMETS_TONIGHT,
        value: JSON.stringify(tonight),
        metadata: { fetchedAt: payload.generatedAt, comets: tonight.comets.length },
      },
      write: {
        key: KEY_ORRERY_SMALLBODIES,
        value: JSON.stringify(payload),
        metadata: {
          fetchedAt: payload.generatedAt,
          comets: payload.comets.length,
          interstellar: payload.interstellar.length,
          placed,
          missing: payload.missing.length,
        },
      },
    }
  } catch (err) {
    const verdict = classifyFailure({
      err,
      envelopeText: previous ? JSON.stringify({ fetchedAt: previous.generatedAt }) : previousText,
      maxAgeMs: SMALLBODIES_MAX_AGE_MS,
      now,
    })
    const detail = `${SMALLBODIES_SIGNATURE} ${verdict.detail}`
    ;(verdict.ok ? console.warn : console.error)(detail)
    return { entry: { ...verdict, signature: SMALLBODIES_SIGNATURE, detail } }
  }
}

/**
 * The orrery's dwarf planets (#99 item 8): one finished body plus metadata in one KV
 * write, under a key of their own. The last copy is read back so the spans are reused
 * for a day. A failure is judged by the copy's age.
 */
export async function refreshOrreryDwarfs(config, deps = {}) {
  const now = deps.now ?? Date.now()
  const previousText = deps.previousText ?? (await readKv(KEY_ORRERY_DWARFS, config))
  const previous = parseJsonOrNull(previousText)
  try {
    const { payload, requests } = await buildOrreryDwarfs({
      now,
      fetchHorizonsText: deps.fetchHorizonsText ?? fetchHorizonsText,
      previous,
      ...(deps.pauseMs === undefined ? {} : { pauseMs: deps.pauseMs }),
      ...budgetDeps(deps),
    })
    const missing = payload.missing.map((m) => `${m.id} (${m.reason})`)
    const detail =
      `ok ${DWARFS_SIGNATURE} ${String(payload.dwarfs.length)} dwarf planets, ` +
      `${String(requests)} JPL requests` +
      (missing.length ? `; WARN missing ${missing.join(', ')}` : '')
    console.log(detail)
    return {
      entry: { signature: DWARFS_SIGNATURE, ok: true, warning: missing.length > 0, detail },
      write: {
        key: KEY_ORRERY_DWARFS,
        value: JSON.stringify(payload),
        metadata: {
          fetchedAt: payload.generatedAt,
          dwarfs: payload.dwarfs.length,
          missing: payload.missing.length,
        },
      },
    }
  } catch (err) {
    const verdict = classifyFailure({
      err,
      envelopeText: previous ? JSON.stringify({ fetchedAt: previous.generatedAt }) : previousText,
      maxAgeMs: DWARFS_MAX_AGE_MS,
      now,
    })
    const detail = `${DWARFS_SIGNATURE} ${verdict.detail}`
    ;(verdict.ok ? console.warn : console.error)(detail)
    return { entry: { ...verdict, signature: DWARFS_SIGNATURE, detail } }
  }
}

/**
 * Space-Track (#101): the catalogue every run, the SATCAT shards once a day, and the
 * history when it gained months, each a finished body with its time in the metadata.
 * Skipped with a warning when the account isn't configured (a local run, or before the
 * secrets were added). A failure is judged by the age of the catalogue it would replace.
 */
export async function refreshSpaceTrack(config, deps = {}) {
  const credentials = spaceTrackCredentials(deps.env ?? process.env)
  if (!credentials) {
    const detail = `${SPACETRACK_SIGNATURE} skipped: SPACETRACK_USER and SPACETRACK_PASS not set`
    console.warn(detail)
    return { entry: { signature: SPACETRACK_SIGNATURE, ok: true, warning: true, detail }, writes: [] }
  }
  const now = deps.now ?? Date.now()
  const previousCatalogText =
    deps.previousCatalogText !== undefined
      ? deps.previousCatalogText
      : await readKv(KEY_SPACETRACK_CATALOG, config)
  const previousHistoryText =
    deps.previousHistoryText !== undefined
      ? deps.previousHistoryText
      : await readKv(KEY_SPACETRACK_HISTORY, config)
  const previousCatalog = parseJsonOrNull(previousCatalogText)
  try {
    const budgetMs = deps.budgetMs ?? SPACETRACK_BUDGET_MS
    if (budgetMs <= 0) throw new Error('job deadline reached (#128)')
    const { catalog, satcat, history, requests } = await buildSpaceTrack({
      now,
      credentials,
      previous: { catalog: previousCatalog, history: parseJsonOrNull(previousHistoryText) },
      budgetMs,
      ...(deps.http === undefined ? {} : { http: deps.http }),
      ...(deps.pauseMs === undefined ? {} : { pauseMs: deps.pauseMs }),
    })
    const fetchedAt = catalog.generatedAt
    const writes = [
      {
        key: KEY_SPACETRACK_CATALOG,
        value: JSON.stringify(catalog),
        metadata: {
          fetchedAt,
          reentries: catalog.tip?.reentries.length ?? 0,
          missing: catalog.missing.length,
        },
      },
    ]
    if (satcat) {
      for (const shard of satcatShards(satcat, fetchedAt)) {
        writes.push({
          key: SPACETRACK_SATCAT_KEY(shard.shard),
          value: JSON.stringify(shard),
          metadata: { fetchedAt, rows: shard.rows.length },
        })
      }
    }
    if (history) {
      writes.push({
        key: KEY_SPACETRACK_HISTORY,
        value: JSON.stringify(history),
        metadata: { fetchedAt, objects: history.objects.length },
      })
    }
    const missing = catalog.missing.map((m) => `${m.id} (${m.reason})`)
    const detail =
      `ok ${SPACETRACK_SIGNATURE} ${String(catalog.tip?.reentries.length ?? 0)} re-entries, ` +
      `SATCAT ${satcat ? `${String(satcat.length)} objects` : 'not due'}, ` +
      `history ${history ? 'updated' : 'unchanged'}, ${String(requests)} requests` +
      (missing.length ? `; WARN missing ${missing.join(', ')}` : '')
    console.log(detail)
    return {
      entry: { signature: SPACETRACK_SIGNATURE, ok: true, warning: missing.length > 0, detail },
      writes,
    }
  } catch (err) {
    const verdict = classifyFailure({
      err,
      envelopeText: previousCatalog
        ? JSON.stringify({ fetchedAt: previousCatalog.generatedAt })
        : previousCatalogText,
      maxAgeMs: SPACETRACK_MAX_AGE_MS,
      now,
    })
    const detail = `${SPACETRACK_SIGNATURE} ${verdict.detail}`
    ;(verdict.ok ? console.warn : console.error)(detail)
    return { entry: { ...verdict, signature: SPACETRACK_SIGNATURE, detail }, writes: [] }
  }
}

/**
 * The satellites DISCOSweb is asked about: the space stations group (its last KV copy),
 * the GP_HISTORY objects, and whatever Space-Track predicts is coming down. In order,
 * each once.
 */
export function discosTargets(stationsText, catalog) {
  const stations = parseJsonOrNull(stationsText)?.rows ?? []
  const ids = [
    ...stations.map((r) => r?.[1]),
    ...HISTORY_OBJECTS.map((o) => o.noradId),
    ...(catalog?.tip?.reentries ?? []).map((r) => r.noradId),
  ].filter((id) => typeof id === 'string' && /^\d+$/.test(id))
  return [...new Set(ids)]
}

/**
 * DISCOSweb (#101): one finished body, written when it changed. Skipped with a warning
 * when the token isn't configured. A failure is judged by the copy's age (14 days).
 */
export async function refreshDiscos(config, deps = {}) {
  const token = discosToken(deps.env ?? process.env)
  if (!token) {
    const detail = `${DISCOS_SIGNATURE} skipped: DISCOSWEB_TOKEN not set`
    console.warn(detail)
    return { entry: { signature: DISCOS_SIGNATURE, ok: true, warning: true, detail }, writes: [] }
  }
  const now = deps.now ?? Date.now()
  const previousText =
    deps.previousText !== undefined ? deps.previousText : await readKv(KEY_DISCOS, config)
  const previous = parseJsonOrNull(previousText)
  try {
    if ((deps.budgetMs ?? 1) <= 0) throw new Error('job deadline reached (#128)')
    const { payload, changed, requests, rateLimit } = await buildDiscos({
      now,
      token,
      satnos: deps.satnos ?? [],
      previous,
      ...(deps.http === undefined ? {} : { http: deps.http }),
      ...(deps.pauseMs === undefined ? {} : { pauseMs: deps.pauseMs }),
    })
    const failedAll = requests > 0 && !changed
    if (failedAll) throw new Error(payload.missing.map((m) => m.reason).join('; ') || 'no answer')
    const missing = payload.missing.map((m) => `${m.id} (${m.reason})`)
    const detail =
      `ok ${DISCOS_SIGNATURE} ${String(Object.keys(payload.craft).length)} craft, ` +
      `${String(Object.keys(payload.satellites).length)} satellites, ${String(requests)} requests` +
      (rateLimit?.limit ? `, rate limit ${rateLimit.limit} (${rateLimit.remaining ?? '?'} left)` : '') +
      (missing.length ? `; WARN missing ${missing.join(', ')}` : '')
    console.log(detail)
    return {
      entry: { signature: DISCOS_SIGNATURE, ok: true, warning: missing.length > 0, detail },
      writes: changed
        ? [
            {
              key: KEY_DISCOS,
              value: JSON.stringify(payload),
              metadata: {
                fetchedAt: payload.generatedAt,
                craft: Object.keys(payload.craft).length,
                satellites: Object.keys(payload.satellites).length,
              },
            },
          ]
        : [],
    }
  } catch (err) {
    const verdict = classifyFailure({
      err,
      envelopeText: previous ? JSON.stringify({ fetchedAt: previous.generatedAt }) : previousText,
      maxAgeMs: DISCOS_MAX_AGE_MS,
      now,
    })
    const detail = `${DISCOS_SIGNATURE} ${verdict.detail}`
    ;(verdict.ok ? console.warn : console.error)(detail)
    return { entry: { ...verdict, signature: DISCOS_SIGNATURE, detail }, writes: [] }
  }
}

async function main(argv) {
  const dryRun = argv.includes('--dry-run')
  // Local runs: --only=orrery-bodies skips the other sources; --bodies-out=path saves
  // the payload a dry run would have written.
  const only = argv.find((a) => a.startsWith('--only='))?.slice('--only='.length)
  const bodiesOut = argv.find((a) => a.startsWith('--bodies-out='))?.slice('--bodies-out='.length)
  const neoOut = argv.find((a) => a.startsWith('--neo-out='))?.slice('--neo-out='.length)
  const smallOut = argv
    .find((a) => a.startsWith('--smallbodies-out='))
    ?.slice('--smallbodies-out='.length)
  const dwarfsOut = argv.find((a) => a.startsWith('--dwarfs-out='))?.slice('--dwarfs-out='.length)
  const stOut = argv.find((a) => a.startsWith('--spacetrack-out='))?.slice('--spacetrack-out='.length)
  const discosOut = argv.find((a) => a.startsWith('--discos-out='))?.slice('--discos-out='.length)
  const satsOut = argv.find((a) => a.startsWith('--sats-out='))?.slice('--sats-out='.length)
  const config = dryRun ? null : readConfig()
  const report = []
  const writes = []
  const deadline = createDeadline()
  // One gate for every CelesTrak request this run: the first non-200 stops them all (#212).
  const celestrak = createCelestrakGate()

  for (const spec of only ? [] : SOURCES) {
    const { entry, write } = await refreshSource(spec, config, deadline, celestrak)
    report.push(entry)
    if (write) writes.push({ key: spec.key, value: write, entry })
  }

  if (!only || only === 'orrery-bodies') {
    const { entry, write } = await refreshOrreryBodies(config, {
      budgetMs: stepBudget(BODIES_BUDGET_MS, deadline),
    })
    report.push(entry)
    if (write) {
      writes.push({ ...write, entry })
      if (dryRun && bodiesOut) {
        await writeFile(bodiesOut, write.value)
        console.log(
          `  saved ${KEY_ORRERY_BODIES} to ${bodiesOut} (${String(write.value.length)} bytes)`,
        )
      }
    }
  }

  // After the craft step, never beside it: both ask JPL, one request at a time (#88).
  if (!only || only === 'orrery-neo') {
    const began = Date.now()
    const { entry, write } = await refreshOrreryNeo(config, {
      budgetMs: stepBudget(NEO_BUDGET_MS, deadline),
    })
    console.log(`  ${NEO_SIGNATURE} took ${String(Math.round((Date.now() - began) / 1000))} s`)
    report.push(entry)
    if (write) {
      writes.push({ ...write, entry })
      if (dryRun && neoOut) {
        await writeFile(neoOut, write.value)
        console.log(`  saved ${KEY_ORRERY_NEO} to ${neoOut} (${String(write.value.length)} bytes)`)
      }
    }
  }

  // After the close-approach step, never beside it: JPL takes one request at a time.
  if (!only || only === 'orrery-smallbodies') {
    const began = Date.now()
    const { entry, write, tonightWrite } = await refreshOrrerySmallBodies(config, {
      budgetMs: stepBudget(SMALLBODIES_BUDGET_MS, deadline),
    })
    console.log(
      `  ${SMALLBODIES_SIGNATURE} took ${String(Math.round((Date.now() - began) / 1000))} s`,
    )
    report.push(entry)
    if (write) {
      writes.push({ ...write, entry })
      if (tonightWrite) {
        writes.push({ ...tonightWrite, entry })
        console.log(`  ${KEY_COMETS_TONIGHT}: ${String(tonightWrite.value.length)} bytes`)
      }
      if (dryRun && smallOut) {
        await writeFile(smallOut, write.value)
        console.log(
          `  saved ${KEY_ORRERY_SMALLBODIES} to ${smallOut} (${String(write.value.length)} bytes)`,
        )
      }
    }
  }

  // After the comet step, never beside it: JPL takes one request at a time.
  if (!only || only === 'orrery-dwarfs') {
    const began = Date.now()
    const { entry, write } = await refreshOrreryDwarfs(config, {
      budgetMs: stepBudget(DWARFS_BUDGET_MS, deadline),
    })
    console.log(`  ${DWARFS_SIGNATURE} took ${String(Math.round((Date.now() - began) / 1000))} s`)
    report.push(entry)
    if (write) {
      writes.push({ ...write, entry })
      if (dryRun && dwarfsOut) {
        await writeFile(dwarfsOut, write.value)
        console.log(`  saved ${KEY_ORRERY_DWARFS} to ${dwarfsOut} (${String(write.value.length)} bytes)`)
      }
    }
  }

  if (!only || only === 'celestrak-groups') {
    // The orrery's satellites (#98), one KV key per group; see celestrak-groups.mjs.
    // Every request goes through the run's CelesTrak gate (#212); Starlink's SupGP
    // (#209) has its own timeout, inside the deadline.
    let supText = null
    const began = Date.now()
    const { entry, writes: satWrites } = await refreshSatGroups({
      now: Date.now(),
      fetchText: beforeDeadline((url) => celestrak.fetchText(url), deadline),
      fetchSupText: beforeDeadline(async (url) => {
        supText = await celestrak.fetchText(url, {
          timeoutMs: stepBudget(SUPGP_TIMEOUT_MS, deadline),
          label: 'CelesTrak SupGP',
        })
        return supText
      }, deadline),
      readPrevious: (key) => readKv(key, config),
      classifyFailure,
    })
    console.log(`  ${entry.signature} took ${String(Math.round((Date.now() - began) / 1000))} s`)
    report.push(entry)
    for (const write of satWrites) writes.push({ ...write, entry })
    if (dryRun && satsOut) await saveSatsDryRun(satsOut, satWrites, supText)
  }

  let stCatalog = null
  if (!only || only === 'spacetrack') {
    // Space-Track (#101): its own account and pace, inside what is left of the job.
    const began = Date.now()
    const { entry, writes: stWrites } = await refreshSpaceTrack(config, {
      budgetMs: stepBudget(SPACETRACK_BUDGET_MS, deadline),
    })
    console.log(
      `  ${SPACETRACK_SIGNATURE} took ${String(Math.round((Date.now() - began) / 1000))} s`,
    )
    report.push(entry)
    for (const write of stWrites) {
      writes.push({ ...write, entry })
      console.log(`  ${write.key}: ${String(write.value.length)} bytes`)
      if (write.key === KEY_SPACETRACK_CATALOG) stCatalog = JSON.parse(write.value)
    }
    if (dryRun && stOut && stWrites.length > 0) {
      await writeFile(
        stOut,
        JSON.stringify(Object.fromEntries(stWrites.map((w) => [w.key, JSON.parse(w.value)]))),
      )
      console.log(`  saved the Space-Track bodies to ${stOut}`)
    }
  }

  if (!only || only === 'spacetrack' || only === 'discos') {
    // DISCOSweb (#101) after Space-Track, so this run's re-entries are among its targets.
    const stationsWrite = writes.find((w) => w.key === 'celestrak:gp:stations:v1')
    const stationsText = stationsWrite?.value ?? (await readKv('celestrak:gp:stations:v1', config))
    const { entry, writes: dWrites } = await refreshDiscos(config, {
      satnos: discosTargets(stationsText, stCatalog),
      budgetMs: deadline.remaining(),
    })
    report.push(entry)
    for (const write of dWrites) {
      writes.push({ ...write, entry })
      console.log(`  ${write.key}: ${String(write.value.length)} bytes`)
    }
    if (dryRun && discosOut && dWrites.length > 0) {
      await writeFile(discosOut, dWrites[0].value)
      console.log(`  saved ${KEY_DISCOS} to ${discosOut}`)
    }
  }

  if (dryRun) {
    console.log(
      `\ndry run: would write ${writes.length} key(s): ${writes.map((w) => w.key).join(', ')}`,
    )
  } else {
    console.log(`\nwriting ${writes.length} key(s) to namespace ${config.namespaceId}`)
    for (const write of writes) {
      try {
        await putKv(write.key, write.value, config, write.metadata)
      } catch (err) {
        console.error(err.message)
        write.entry.ok = false
        write.entry.detail = `FAIL ${err.message}`
      }
    }
  }

  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2))
  return report.some((e) => !e.ok) ? 1 : 0
}

// Guard so importing this module for its pure helpers does not run the job.
const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code
    })
    .catch((err) => {
      console.error(err)
      process.exitCode = 1
    })
}
