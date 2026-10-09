#!/usr/bin/env node
// Refresh the durable Workers KV snapshots that back /api/iss-tle, /api/satellites
// and /api/launches.
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
//
// Env (write mode only):
//   CLOUDFLARE_API_TOKEN   token with "Workers KV Storage: Edit" on the account
//   CLOUDFLARE_ACCOUNT_ID  account that owns the namespace
//   KV_NAMESPACE_ID        optional override, defaults to the observatory namespace

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

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

const FETCH_TIMEOUT_MS = 20_000
const FETCH_RETRIES = 3
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
    ? { ok: true, detail: `WARN ${reason}; KV copy ${ageText}, limit ${limit}` }
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

function fetchTle(catnr) {
  return fetchWithRetry(
    CELESTRAK_TLE(catnr),
    { headers: { Accept: 'text/plain' } },
    {
      validate: (text) => {
        const parsed = parseTle(text)
        if (!parsed) throw new Error(`TLE for CATNR ${String(catnr)} failed validation`)
        return parsed
      },
    },
  )
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

function envelope(source, data) {
  return JSON.stringify({ fetchedAt: new Date().toISOString(), source, data })
}

function kvUrl(key, config) {
  return `${CF_API_BASE}/accounts/${config.accountId}/storage/kv/namespaces/${config.namespaceId}/values/${encodeURIComponent(key)}`
}

async function putKv(key, value, config) {
  const res = await fetch(kvUrl(key, config), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'text/plain',
    },
    body: value,
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

// ---------------------------------------------------------------- main

/** Fetch every tracked satellite; fails only if none validate. */
async function fetchSatellites() {
  const records = []
  for (const sat of await loadSats()) {
    try {
      const tle = await fetchTle(sat.catnr)
      records.push({ label: sat.label, catnr: sat.catnr, ...tle })
      console.log(`ok  sat     ${sat.label} (${String(sat.catnr)})`)
    } catch (err) {
      console.error(`FAIL sat     ${sat.label} (${String(sat.catnr)}): ${err.message}`)
    }
  }
  if (records.length === 0) throw new Error('no satellite TLEs validated')
  return records
}

const SOURCES = [
  {
    signature: 'refresh:iss',
    key: KEY_ISS,
    maxAgeMs: 36 * HOUR_MS,
    source: 'celestrak',
    fetch: () => fetchTle(ISS_CATNR),
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
]

async function refreshSource(spec, config) {
  try {
    const data = await spec.fetch()
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
    return { entry: { signature: spec.signature, ok: verdict.ok, detail } }
  }
}

async function main(argv) {
  const dryRun = argv.includes('--dry-run')
  const config = dryRun ? null : readConfig()
  const report = []
  const writes = []

  for (const spec of SOURCES) {
    const { entry, write } = await refreshSource(spec, config)
    report.push(entry)
    if (write) writes.push({ key: spec.key, value: write, entry })
  }

  if (dryRun) {
    console.log(
      `\ndry run: would write ${writes.length} key(s): ${writes.map((w) => w.key).join(', ')}`,
    )
  } else {
    console.log(`\nwriting ${writes.length} key(s) to namespace ${config.namespaceId}`)
    for (const write of writes) {
      try {
        await putKv(write.key, write.value, config)
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
