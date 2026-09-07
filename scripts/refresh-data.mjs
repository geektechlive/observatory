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
// Usage:
//   node scripts/refresh-data.mjs            fetch, validate, write to KV
//   node scripts/refresh-data.mjs --dry-run  fetch and validate only, no credentials needed
//
// Env (write mode only):
//   CLOUDFLARE_API_TOKEN   token with "Workers KV Storage: Edit" on the account
//   CLOUDFLARE_ACCOUNT_ID  account that owns the namespace
//   KV_NAMESPACE_ID        optional override, defaults to the observatory namespace

import { readFile } from 'node:fs/promises'
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

// ---------------------------------------------------------------- io helpers

async function fetchWithTimeout(url, init = {}) {
  let lastError = new Error('no attempt made')
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, { ...init, signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
      return res
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < FETCH_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * attempt))
      }
    } finally {
      clearTimeout(timer)
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

async function fetchTle(catnr) {
  const res = await fetchWithTimeout(CELESTRAK_TLE(catnr), {
    headers: { Accept: 'text/plain' },
  })
  const text = await res.text()
  const parsed = parseTle(text)
  if (!parsed) throw new Error(`TLE for CATNR ${catnr} failed validation`)
  return parsed
}

function envelope(source, data) {
  return JSON.stringify({ fetchedAt: new Date().toISOString(), source, data })
}

async function putKv(key, value, config) {
  const url = `${CF_API_BASE}/accounts/${config.accountId}/storage/kv/namespaces/${config.namespaceId}/values/${encodeURIComponent(key)}`
  const res = await fetch(url, {
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

async function main(argv) {
  const dryRun = argv.includes('--dry-run')
  const writes = []
  let issFailed = false
  let otherFailures = 0

  // ISS TLE
  try {
    const iss = await fetchTle(ISS_CATNR)
    console.log(`ok  iss     ${iss.name} epoch ${iss.line1.slice(18, 32)}`)
    writes.push({ key: KEY_ISS, value: envelope('celestrak', iss) })
  } catch (err) {
    issFailed = true
    console.error(`FAIL iss     ${err.message}`)
  }

  // Tracked satellites
  const sats = await loadSats()
  const satRecords = []
  for (const sat of sats) {
    try {
      const tle = await fetchTle(sat.catnr)
      satRecords.push({ label: sat.label, catnr: sat.catnr, ...tle })
      console.log(`ok  sat     ${sat.label} (${sat.catnr})`)
    } catch (err) {
      console.error(`FAIL sat     ${sat.label} (${sat.catnr}): ${err.message}`)
    }
  }
  if (satRecords.length > 0) {
    writes.push({ key: KEY_SATELLITES, value: envelope('celestrak', satRecords) })
  } else {
    otherFailures++
    console.error('FAIL sats    no satellite TLEs validated, skipping KV write')
  }

  // Launches backup
  try {
    const res = await fetchWithTimeout(RLL_URL, { headers: { Accept: 'application/json' } })
    const json = await res.json()
    if (!isValidLaunchesPayload(json)) throw new Error('unexpected RLL payload shape')
    console.log(`ok  launches ${json.result.length} upcoming`)
    writes.push({ key: KEY_LAUNCHES_BACKUP, value: envelope('rocketlaunch.live', json) })
  } catch (err) {
    otherFailures++
    console.error(`FAIL launches ${err.message}`)
  }

  if (dryRun) {
    console.log(
      `\ndry run: would write ${writes.length} key(s): ${writes.map((w) => w.key).join(', ')}`,
    )
  } else if (writes.length === 0) {
    console.error('\nnothing to write')
  } else {
    const config = readConfig()
    console.log(`\nwriting ${writes.length} key(s) to namespace ${config.namespaceId}`)
    for (const write of writes) {
      await putKv(write.key, write.value, config)
    }
  }

  if (issFailed) {
    console.error('\nISS TLE refresh failed, this is the critical key')
    return 1
  }
  return otherFailures > 0 ? 1 : 0
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
