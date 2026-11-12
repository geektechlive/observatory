#!/usr/bin/env node
// Headline endpoint health check for observatory.
//
// Hits the eight endpoints that the dashboard cannot render without, asserts that
// each one actually carries data (not just a 200 with nulls), and treats the
// X-Data-Degraded marker as a failure so a silent fallback cannot pass unnoticed.
// It also fetches CARTO's live map style once and checks its credit (#221).
//
// Usage:
//   node scripts/check-health.mjs
//   BASE_URL=https://preview.example.pages.dev node scripts/check-health.mjs
//
// Exits 1 if any check fails.

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const DEFAULT_BASE_URL = 'https://observatory.geektechlive.com'
const TIMEOUT_MS = 15_000
const CONCURRENCY = 3
/** Total attempts per endpoint, including the first. */
const ATTEMPTS = 3
/** Backoff before attempt N. Upstreams that blip usually recover in seconds. */
const backoffMs = (attempt) => (attempt === 2 ? 2_000 : 5_000)
/**
 * Wait before retrying a NEG replay. The Function negative-caches a failure for 60 s
 * (NEG_TTL_SECONDS in functions/api/_cache.ts), so a retry inside that window only
 * replays the same cached error. Until 2026-10-09 every "after 3 attempts" failure was
 * three reads of one cache entry (69 ms), never the upstream.
 */
export const NEG_RETRY_DELAY_MS = 65_000
/**
 * Wait before re-asking after `X-Cache: REVALIDATING` (#83). That answer is the old body,
 * served while the refresh runs behind it, so it says nothing about the upstream. The
 * refresh gives up by fetchUpstream's 8 s deadline; the next answer is then a fresh HIT
 * or a STALE carrying the failure's X-Error-Kind.
 */
export const REVALIDATE_RECHECK_MS = 12_000
/**
 * How old a STALE fallback may be and still pass. The site is serving real data, so a
 * short upstream outage is not worth a page; past this it is, because visitors are
 * looking at hours-old data. Contract-caused STALE fails at any age.
 */
export const STALE_GRACE_SECONDS = 2 * 60 * 60
/**
 * A refresh slower than this is a WARN (#86). DONKI took 8.2 s for days (#65) and every
 * run passed. Since #83 the probe's own time is our cache's, not the upstream's, so this
 * reads `X-Produce-Ms`: how long the refresh behind a HIT or MISS took.
 */
export const SLOW_PRODUCE_MS = 3_000
/** Where the per-endpoint results go for scripts/report-incidents.mjs. */
const REPORT_PATH = process.env.INCIDENT_REPORT ?? 'incident-report.json'

const nonNull = (value) => value !== null && value !== undefined

/** Each check: the path, plus a predicate over the parsed JSON body. */
export const CHECKS = [
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
  // Unprobed until #61, which is how a dead APOD and a week-long DONKI outage (#42) went unnoticed.
  {
    path: '/api/apod',
    requires: 'title and a media url',
    check: (b) => typeof b?.title === 'string' && typeof b?.url === 'string',
  },
  {
    path: '/api/donki',
    requires: 'flares, cmes, geomagneticStorms and seps arrays',
    check: (b) =>
      ['flares', 'cmes', 'geomagneticStorms', 'seps'].every((k) => Array.isArray(b?.[k])),
  },
  // The orrery's craft, Earth and Moon (#93): KV-only, written by the refresh job.
  {
    path: '/api/orrery-bodies',
    requires: 'non-empty bodies array with sampled spans',
    check: (b) =>
      Array.isArray(b?.bodies) &&
      b.bodies.length > 0 &&
      b.bodies.every((x) => x?.fine !== undefined && x?.coarse !== undefined),
  },
  // The orrery's close approaches, Scout and NEOCC (#92): KV-only, written by the refresh job.
  {
    path: '/api/orrery-neo',
    requires: 'non-empty approaches array, each with its CAD close approach',
    check: (b) =>
      Array.isArray(b?.approaches) &&
      b.approaches.length > 0 &&
      b.approaches.every(
        (x) => typeof x?.closeApproach?.distAu === 'number' && x?.fine !== undefined,
      ),
  },
  // The orrery's comets and interstellar objects (#99): KV-only, written by the refresh job.
  {
    path: '/api/orrery-smallbodies',
    requires: 'a comets array and a non-empty interstellar array, each with its elements',
    check: (b) =>
      Array.isArray(b?.comets) &&
      Array.isArray(b?.interstellar) &&
      b.interstellar.length > 0 &&
      b.interstellar.every((x) => typeof x?.elements?.e === 'number'),
  },
  // The planets, Sentry and fireball feeds (#146): KV-only, built from JPL by the refresh job.
  {
    path: '/api/planets',
    requires: 'a non-empty bodies array',
    check: (b) => Array.isArray(b?.bodies) && b.bodies.length > 0,
  },
  {
    path: '/api/sentry',
    requires: 'a non-empty data array',
    check: (b) => Array.isArray(b?.data) && b.data.length > 0,
  },
  {
    path: '/api/fireball',
    requires: 'a non-empty data array',
    check: (b) => Array.isArray(b?.data) && b.data.length > 0,
  },
  // The orrery's dwarf planets (#99 item 8): KV-only, their own key, written by the refresh job.
  {
    path: '/api/orrery-dwarfs',
    requires: 'a non-empty dwarfs array, each with its sampled span',
    check: (b) =>
      Array.isArray(b?.dwarfs) &&
      b.dwarfs.length > 0 &&
      b.dwarfs.every((x) => Array.isArray(x?.coarse?.samples)),
  },
  // The Tonight panel's comets (#135): KV-only, cut from the comet payload by the refresh job.
  {
    path: '/api/comets-tonight',
    requires: 'a non-empty comets array, each with a magnitude law and a sampled span',
    check: (b) =>
      Array.isArray(b?.comets) &&
      b.comets.length > 0 &&
      b.comets.every(
        (x) =>
          typeof x?.m1 === 'number' &&
          typeof x?.k1 === 'number' &&
          (Array.isArray(x?.fine?.samples) || Array.isArray(x?.coarse?.samples)),
      ),
  },
  // On-demand lookup (#100): JPL through the jpl-queue Durable Object. A fixed span is
  // cached for a day, so most runs never reach JPL. It is one the orrery asks for (the
  // 2-day span around 2026-01-15), as the endpoint takes no other (#223). Until the Worker
  // is deployed and bound, the endpoint says "not set up" (X-Not-Configured), which only warns.
  {
    path: '/api/trajectory?id=sb:20000433&start=2025-01-07&end=2027-01-07&step=2d',
    requires: 'an object and 366 samples of position and velocity',
    notConfiguredWarns: true,
    check: (b) =>
      typeof b?.object?.name === 'string' &&
      Array.isArray(b?.fine?.samples) &&
      b.fine.samples.length === 2196,
  },
  // Space-Track (#101): KV-only, read by the refresh job with the owner's account. Some
  // weeks nothing is predicted to re-enter, so an empty TIP list passes; no list fails.
  {
    path: '/api/spacetrack?part=catalog',
    requires: 'a TIP re-entries list, each with its predicted time',
    check: (b) =>
      Array.isArray(b?.tip?.reentries) &&
      b.tip.reentries.every(
        (r) => typeof r?.noradId === 'string' && typeof r?.decayEpoch === 'string',
      ),
  },
  // ESA DISCOS (#101): KV-only, read by the refresh job with the owner's token.
  {
    path: '/api/discos',
    requires: 'the orrery craft, each with a name',
    check: (b) =>
      typeof b?.craft === 'object' &&
      b.craft !== null &&
      Object.keys(b.craft).length > 0 &&
      Object.values(b.craft).every((c) => typeof c?.name === 'string'),
  },
  // The orrery's satellites (#98): KV-only, one CelesTrak group per request. The small
  // stations group proves the pipeline without pulling Starlink's 1.7 MB every run.
  {
    path: '/api/orrery-sats?group=stations',
    requires: 'non-empty rows, each with the 13 catalogue fields',
    check: (b) =>
      Array.isArray(b?.rows) &&
      b.rows.length > 0 &&
      b.rows.every((r) => Array.isArray(r) && r.length === 13 && typeof r[1] === 'string'),
  },
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
  // The handler said the payload broke its schema: drift wearing a 502.
  if (result.errorKind === 'contract') return false
  const { status } = result
  return status === 0 || status === 429 || status >= 500
}

/** Delay before attempt N, given the failure that prompted it. */
export function retryDelayMs(attempt, failed) {
  if (failed?.cache === 'REVALIDATING') return REVALIDATE_RECHECK_MS
  return failed?.cache === 'NEG' ? NEG_RETRY_DELAY_MS : backoffMs(attempt)
}

/**
 * A REVALIDATING answer carries the body an earlier refresh stored, so neither its pass
 * nor its failure says anything about the upstream now: ask again once the refresh lands.
 */
const unsettled = (result) => result.cache === 'REVALIDATING'

/**
 * Decide whether a response served from the stale-if-error fallback is acceptable.
 * Returns { ok: true } for anything not STALE; { ok: true, warning } for a recent
 * upstream-caused STALE; { ok: false, note } otherwise.
 */
export function judgeStale({ cache, errorKind, dataAge, staleStatus }) {
  if (cache !== 'STALE') return { ok: true }
  // Number(null) and Number('') are 0: an absent age is unknown, not brand-new.
  const age = dataAge === null || dataAge === undefined || dataAge === '' ? NaN : Number(dataAge)
  const why = `${errorKind ?? 'unknown'}: HTTP ${staleStatus ?? '?'}`
  if (errorKind === 'contract') {
    return { ok: false, note: `stale ${String(age)}s (${why})` }
  }
  if (!Number.isFinite(age) || age > STALE_GRACE_SECONDS) {
    return {
      ok: false,
      note: `stale ${String(age)}s, past ${String(STALE_GRACE_SECONDS)}s grace (${why})`,
    }
  }
  return { ok: true, warning: `stale ${String(age)}s (${why})` }
}

/**
 * A warning when the refresh behind a HIT or MISS took longer than SLOW_PRODUCE_MS.
 * A STALE or REVALIDATING body's time belongs to an older refresh, so it is not judged.
 */
export function slowWarning(cache, produceMs) {
  if (cache !== 'HIT' && cache !== 'MISS') return undefined
  const ms = produceMs === null || produceMs === '' ? NaN : Number(produceMs)
  return ms > SLOW_PRODUCE_MS ? `slow upstream: ${String(ms)}ms` : undefined
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
  const delayMs = opts.delayMs ?? retryDelayMs

  let attempt = 1
  let result = await runOnce(attempt)

  while ((unsettled(result) || (!result.ok && isTransient(result))) && attempt < attempts) {
    attempt += 1
    const wait = delayMs(attempt, result)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    result = await runOnce(attempt)
  }

  return { ...result, attempts: attempt }
}

/**
 * Run one check once. A body that fails its contract is marked `reason: 'contract'`, so
 * toReport never calls it upstream-caused, whatever the response headers say.
 */
export async function runCheck(baseUrl, spec) {
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
    const cache = res.headers.get('x-cache')
    const errorKind = res.headers.get('x-error-kind')
    const base = { path: spec.path, status: res.status, ms, cache, errorKind }

    const notConfigured = res.headers.get('x-not-configured')
    if (!res.ok && spec.notConfiguredWarns && notConfigured) {
      const warning = `not set up (${notConfigured})`
      return { ...base, ok: true, note: warning, warning }
    }
    if (!res.ok) {
      const kind = errorKind ? ` ${errorKind}` : ''
      return { ...base, ok: false, note: `HTTP ${res.status}${kind}${cache ? ` (${cache})` : ''}` }
    }
    if (res.headers.get('x-data-degraded') === '1') {
      const source = res.headers.get('x-data-source') ?? 'unknown'
      return { ...base, ok: false, note: `degraded (${source})` }
    }

    const stale = judgeStale({
      cache,
      errorKind,
      dataAge: res.headers.get('x-data-age'),
      staleStatus: res.headers.get('x-stale-status'),
    })
    if (!stale.ok) return { ...base, ok: false, note: stale.note }

    let body
    try {
      body = await res.json()
    } catch {
      return { ...base, ok: false, reason: 'contract', note: 'invalid JSON' }
    }

    if (!spec.check(body)) {
      return { ...base, ok: false, reason: 'contract', note: `missing ${spec.requires}` }
    }

    const source = res.headers.get('x-data-source')
    const warning = stale.warning ?? slowWarning(cache, res.headers.get('x-produce-ms'))
    const note = [source, cache, warning].filter(Boolean).join(' / ') || 'ok'
    return { ...base, ok: true, note, warning }
  } catch (err) {
    const ms = Date.now() - started
    const message = err?.name === 'AbortError' ? `timeout after ${TIMEOUT_MS} ms` : err.message
    return { path: spec.path, ok: false, status: 0, ms, note: message }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The basemap style WorldMap.tsx loads. Its sources' `attribution` is the map's credit,
 * and credits are licence terms (#179). The e2e serves a dated copy (#143), so only this
 * check notices if CARTO changes the live credit (#221).
 */
export const CARTO_STYLE_URL =
  'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json'
/** The report entry's name: `health:carto-map-credit` in the issue title and Discord. */
export const MAP_CREDIT_CHECK = 'carto-map-credit'
const REQUIRED_CREDITS = ['CARTO', 'OpenStreetMap']
/** How much of the found credit text an incident quotes. */
const CREDIT_EXCERPT = 160

/** The attribution text of every source in a style, tags stripped, or '' if none. */
function styleCredit(style) {
  const sources = Object.values(style?.sources ?? {})
  return sources
    .map((s) => (typeof s?.attribution === 'string' ? s.attribution : ''))
    .join(' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Fetch CARTO's live style once (no retries) and check its credit names CARTO and
 * OpenStreetMap. CARTO not answering is upstream (`errorKind: 'upstream'`, held #71);
 * a style that answers without the credit is drift (`reason: 'contract'`, alerts at once).
 */
export async function checkMapCredit(fetchImpl = fetch) {
  const started = Date.now()
  const base = { path: MAP_CREDIT_CHECK }
  const upstream = (status, note) => ({
    ...base,
    ok: false,
    status,
    ms: Date.now() - started,
    errorKind: 'upstream',
    note,
  })

  let res
  let style
  try {
    res = await fetchImpl(CARTO_STYLE_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return upstream(res.status, `CARTO style HTTP ${String(res.status)}`)
    style = await res.json()
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
    const why = timedOut ? `timeout after ${String(TIMEOUT_MS)} ms` : String(err?.message ?? err)
    return upstream(res?.status ?? 0, `CARTO style unreadable: ${why}`)
  }

  const ms = Date.now() - started
  const credit = styleCredit(style)
  const missing = REQUIRED_CREDITS.filter((name) => !credit.includes(name))
  if (missing.length > 0) {
    const found = credit ? `"${credit.slice(0, CREDIT_EXCERPT)}"` : 'none'
    const note = `credit missing ${missing.join(' and ')} (found: ${found})`
    return { ...base, ok: false, status: res.status, ms, reason: 'contract', note }
  }
  return {
    ...base,
    ok: true,
    status: res.status,
    ms,
    note: `credits ${REQUIRED_CREDITS.join(' and ')}`,
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

/** One human-readable line for a result; also the detail carried into an incident issue. */
function describe(r) {
  // A check that only passed on retry is still a signal worth seeing.
  const retries = r.attempts > 1 ? ` (after ${String(r.attempts)} attempts)` : ''
  return `${r.ok ? 'PASS' : 'FAIL'} ${r.path} HTTP ${String(r.status)} ${String(r.ms)}ms ${r.note}${retries}`
}

/**
 * Upstream-caused: our handler said so (`X-Error-Kind: upstream` on its 503, its degraded
 * answer or its STALE fallback) and the body passed its contract. The reporter holds
 * these for UPSTREAM_THRESHOLD runs (#71). Anything else, including a timeout reaching
 * our own site, alerts on the first run.
 */
function isUpstreamCaused(r) {
  return !r.ok && r.errorKind === 'upstream' && r.reason !== 'contract'
}

/** The incident report scripts/report-incidents.mjs consumes: one entry per endpoint. */
export function toReport(results) {
  return results.map((r) => ({
    signature: `health:${r.path}`,
    ok: r.ok,
    detail: describe(r),
    // Passing on a STALE fallback is tolerated, not recovered: an open issue stays open.
    ...(r.ok && r.warning ? { warning: true } : {}),
    ...(isUpstreamCaused(r) ? { upstream: true } : {}),
  }))
}

function printTable(results) {
  const pathWidth = Math.max(...results.map((r) => r.path.length))
  console.log(
    `${'STATUS'.padEnd(7)}${'ENDPOINT'.padEnd(pathWidth + 2)}${'HTTP'.padEnd(6)}${'MS'.padEnd(7)}NOTE`,
  )
  for (const r of results) {
    const status = r.ok ? (r.warning ? 'WARN' : 'PASS') : 'FAIL'
    const retries = r.attempts > 1 ? ` (after ${String(r.attempts)} attempts)` : ''
    console.log(
      `${status.padEnd(7)}${r.path.padEnd(pathWidth + 2)}${String(r.status).padEnd(6)}${String(r.ms).padEnd(7)}${r.note}${retries}`,
    )
  }
}

export async function main({
  runAll: run = runAll,
  checkCredit = checkMapCredit,
  writeReport = (text) => writeFile(REPORT_PATH, text),
  log = console.log,
  error = console.error,
} = {}) {
  const baseUrl = (process.env.BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  log(`health check against ${baseUrl}\n`)

  const [endpoints, credit] = await Promise.all([run(baseUrl, CHECKS, CONCURRENCY), checkCredit()])
  const results = [...endpoints, credit]
  printTable(results)
  await writeReport(JSON.stringify(toReport(results), null, 2))

  const failed = results.filter((r) => !r.ok)
  const flaky = results.filter((r) => r.ok && r.attempts > 1)
  log(`\n${results.length - failed.length}/${results.length} passed`)
  if (flaky.length > 0) {
    log(`recovered on retry: ${flaky.map((r) => r.path).join(', ')}`)
  }
  if (failed.length > 0) {
    error(`failing endpoints: ${failed.map((r) => r.path).join(', ')}`)
  }
  // 0 even with failures: they are in the report, and report-incidents (the next step)
  // turns them into the issue and Discord alert. A red job only made GitHub email about
  // outages nobody could fix (#120). A crash, or a report that can't be written, still
  // rejects and exits 1, and so does a failing reporter step.
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
