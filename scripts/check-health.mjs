#!/usr/bin/env node
// Headline endpoint health check for observatory.
//
// Hits the eight endpoints that the dashboard cannot render without, asserts that
// each one actually carries data (not just a 200 with nulls), and treats the
// X-Data-Degraded marker as a failure so a silent fallback cannot pass unnoticed.
//
// Usage:
//   node scripts/check-health.mjs
//   BASE_URL=https://preview.example.pages.dev node scripts/check-health.mjs
//
// Exits 1 if any check fails.

import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const DEFAULT_BASE_URL = 'https://observatory.geektechlive.com'
const TIMEOUT_MS = 15_000
const CONCURRENCY = 3
/** Total attempts per endpoint, including the first. */
const ATTEMPTS = 3
/** Backoff before attempt N. Upstreams that blip usually recover in seconds. */
const backoffMs = (attempt) => (attempt === 2 ? 2_000 : 5_000)

const nonNull = (value) => value !== null && value !== undefined

/** Each check: the path, plus a predicate over the parsed JSON body. */
const CHECKS = [
  {
    path: '/api/solar-wind',
    requires: 'currentKp and windSpeed present',
    check: (b) => nonNull(b?.currentKp) && nonNull(b?.windSpeed),
  },
  {
    path: '/api/geomag',
    requires: 'currentDst and currentBz present',
    check: (b) => nonNull(b?.currentDst) && nonNull(b?.currentBz),
  },
  {
    path: '/api/iss-tle',
    requires: 'line1 and line2 present',
    check: (b) => typeof b?.line1 === 'string' && typeof b?.line2 === 'string',
  },
  {
    path: '/api/satellites',
    requires: 'non-empty satellites array',
    check: (b) => Array.isArray(b?.satellites) && b.satellites.length > 0,
  },
  { path: '/api/launches', requires: '200 + JSON', check: () => true },
  { path: '/api/neo', requires: '200 + JSON', check: () => true },
  { path: '/api/quakes', requires: '200 + JSON', check: () => true },
  { path: '/api/eonet', requires: '200 + JSON', check: () => true },
]

/**
 * Is this failure worth another try?
 *
 * Only infrastructure-shaped failures are: a timeout or network error
 * (status 0), an upstream 5xx — our handlers normalize upstream trouble to
 * 502/503 — or rate limiting.
 *
 * Content-contract failures are deliberately excluded. A 200 that is missing
 * required fields, or is flagged degraded, means the upstream changed shape;
 * that will not fix itself in five seconds, and retrying it would only delay a
 * real alert. Those are exactly the silent-drift failures this check exists to
 * catch, so they fail fast.
 */
export function isTransient(result) {
  if (result.ok) return false
  const { status } = result
  return status === 0 || status === 429 || status >= 500
}

/**
 * Run one check, retrying transient failures.
 *
 * Without this a single slow upstream fails the workflow and pages Discord. On
 * 2026-09-10 EONET took longer than the Function's own 8s fetch deadline, so
 * /api/eonet returned 503 once; it was serving normally before and after, and
 * that was the only failure in thirty runs. A monitor that cries wolf on one
 * blip is a monitor people learn to ignore.
 */
export async function runWithRetry(runOnce, opts = {}) {
  const attempts = opts.attempts ?? ATTEMPTS
  const delayMs = opts.delayMs ?? backoffMs

  let attempt = 1
  let result = await runOnce(attempt)

  while (!result.ok && isTransient(result) && attempt < attempts) {
    attempt += 1
    const wait = delayMs(attempt)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    result = await runOnce(attempt)
  }

  return { ...result, attempts: attempt }
}

async function runCheck(baseUrl, spec) {
  const url = `${baseUrl}${spec.path}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const started = Date.now()

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    const ms = Date.now() - started

    if (!res.ok) {
      return { path: spec.path, ok: false, status: res.status, ms, note: `HTTP ${res.status}` }
    }
    if (res.headers.get('x-data-degraded') === '1') {
      const source = res.headers.get('x-data-source') ?? 'unknown'
      return { path: spec.path, ok: false, status: res.status, ms, note: `degraded (${source})` }
    }

    let body
    try {
      body = await res.json()
    } catch {
      return { path: spec.path, ok: false, status: res.status, ms, note: 'invalid JSON' }
    }

    if (!spec.check(body)) {
      return {
        path: spec.path,
        ok: false,
        status: res.status,
        ms,
        note: `missing ${spec.requires}`,
      }
    }

    const source = res.headers.get('x-data-source')
    const cache = res.headers.get('x-cache')
    const note = [source, cache].filter(Boolean).join(' / ') || 'ok'
    return { path: spec.path, ok: true, status: res.status, ms, note }
  } catch (err) {
    const ms = Date.now() - started
    const message = err?.name === 'AbortError' ? `timeout after ${TIMEOUT_MS} ms` : err.message
    return { path: spec.path, ok: false, status: 0, ms, note: message }
  } finally {
    clearTimeout(timer)
  }
}

/** Run the specs with a fixed worker-pool concurrency, preserving input order. */
async function runAll(baseUrl, specs, concurrency) {
  const results = new Array(specs.length)
  let next = 0

  const worker = async () => {
    while (true) {
      const index = next++
      if (index >= specs.length) return
      const spec = specs[index]
      results[index] = await runWithRetry(() => runCheck(baseUrl, spec))
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, specs.length) }, worker))
  return results
}

function printTable(results) {
  const pathWidth = Math.max(...results.map((r) => r.path.length))
  console.log(
    `${'STATUS'.padEnd(7)}${'ENDPOINT'.padEnd(pathWidth + 2)}${'HTTP'.padEnd(6)}${'MS'.padEnd(7)}NOTE`,
  )
  for (const r of results) {
    const status = r.ok ? 'PASS' : 'FAIL'
    // A check that only passed on retry is still a signal worth seeing.
    const retries = r.attempts > 1 ? ` (after ${String(r.attempts)} attempts)` : ''
    console.log(
      `${status.padEnd(7)}${r.path.padEnd(pathWidth + 2)}${String(r.status).padEnd(6)}${String(r.ms).padEnd(7)}${r.note}${retries}`,
    )
  }
}

async function main() {
  const baseUrl = (process.env.BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  console.log(`health check against ${baseUrl}\n`)

  const results = await runAll(baseUrl, CHECKS, CONCURRENCY)
  printTable(results)

  const failed = results.filter((r) => !r.ok)
  const flaky = results.filter((r) => r.ok && r.attempts > 1)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (flaky.length > 0) {
    console.log(`recovered on retry: ${flaky.map((r) => r.path).join(', ')}`)
  }
  if (failed.length > 0) {
    console.error(`failing endpoints: ${failed.map((r) => r.path).join(', ')}`)
    return 1
  }
  return 0
}

// Guard so importing this module does not run the checks.
const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((err) => {
      console.error(err)
      process.exitCode = 1
    })
}
