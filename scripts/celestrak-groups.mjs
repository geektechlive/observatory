// The orrery's satellites (#98): CelesTrak GP data as OMM JSON, trimmed to compact
// rows (src/lib/orbit/satCatalog.ts) and written to KV as one finished body per group,
// `celestrak:gp:<group>:v1`, for /api/orrery-sats to stream through.
//
// CelesTrak refuses Cloudflare Workers egress (docs/reference/data-feeds-and-monitoring.md, "Upstream quirks"), so this runs in
// the refresh job. Eight GP downloads, one at a time with a pause, every 6 h: inside
// CelesTrak's guidance not to fetch the same data more than once per update (~2 h).
// Starlink comes out of `active` (see satCatalog.ts), so its GP group is never
// downloaded on its own; a ninth download, Starlink's supplemental GP (#209), then
// replaces those elements with ones fitted to SpaceX's ephemerides.

import {
  CELESTRAK_FETCH,
  overlaySupplemental,
  SAT_FIELDS,
  SAT_GROUPS,
  splitGroups,
  toRow,
} from '../src/lib/orbit/satCatalog.ts'

/** KV key per stored group. */
export const SAT_KEY = (group) => `celestrak:gp:${group}:v1`
/** /api/orrery-sats calls a copy degraded past this, and so does the refresh job. */
export const SATS_MAX_AGE_MS = 36 * 3_600_000
export const SATS_SIGNATURE = 'refresh:celestrak-groups'
/** A group must give propagatable rows for at least this share of its records. */
const MIN_USABLE = 0.9
const DEFAULT_PAUSE_MS = 2000

export const celestrakGroupUrl = (group) =>
  `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=json`

const FETCH_TIMEOUT_MS = 30_000

/**
 * One CelesTrak download. CelesTrak answers 403 "GP data has not updated since your
 * last successful download…" when the same address asks again inside its 2 h update
 * cycle (seen 2026-11-07). That is no outage and a retry only adds load, so it fails
 * at once with a plain reason; the stored copy is then judged by its age. Any other
 * failure goes to `retrying` (the job's fetchWithRetry).
 */
export async function celestrakFetchText(url, { fetchImpl = fetch, retrying }) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (res.ok) return res.text()
  const body = await res.text().catch(() => '')
  if (res.status === 403 && /has not updated/i.test(body))
    throw new Error('CelesTrak: not updated since this address last downloaded it (403)')
  return retrying(url)
}

/** One CelesTrak answer as rows; throws when it isn't a usable catalogue. */
function parseGroup(text, group) {
  let records
  try {
    records = JSON.parse(text)
  } catch {
    throw new Error(`${group}: not a JSON array (${text.slice(0, 60).replace(/\s+/g, ' ')})`)
  }
  if (!Array.isArray(records)) throw new Error(`${group}: not a JSON array`)
  if (records.length === 0) throw new Error(`${group}: empty`)
  const rows = records.map(toRow).filter((r) => r !== null)
  if (rows.length < records.length * MIN_USABLE)
    throw new Error(`${group}: only ${String(rows.length)} of ${String(records.length)} records usable`)
  return rows
}

/**
 * Starlink's supplemental GP (#209): elements CelesTrak fits to SpaceX's published
 * ephemerides, about 5 MB of JSON. CelesTrak's usage policy asks for SupGP no more than
 * once per 2 h; the job runs every 6 h and asks once.
 */
export const SUPGP_STARLINK_URL =
  'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=json'
/** Its own timeout: 5 MB takes longer than a GP group. The job caps it by its deadline. */
export const SUPGP_TIMEOUT_MS = 60_000

/**
 * One CelesTrak download under the usage policy's strictest reading: "M2M software
 * should immediately stop querying when it receives any non-HTTP 200 responses". Only
 * a 200 is accepted, and nothing is retried.
 */
export async function celestrakStrictFetch(url, { fetchImpl = fetch, timeoutMs = SUPGP_TIMEOUT_MS }) {
  if (!(timeoutMs > 0)) throw new Error('CelesTrak SupGP: no time left in the job (#128)')
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (res.status === 200) return res.text()
  const body = await res.text().catch(() => '')
  const why = /has not updated/i.test(body) ? ', not updated since the last download' : ''
  throw new Error(`CelesTrak SupGP: HTTP ${String(res.status)}${why}, not retried`)
}

/**
 * Lay SupGP over the Starlink slice of `active`. Asked only when that slice exists and
 * every GP request this run came back: after any failure CelesTrak's policy says stop.
 */
async function supplementStarlink({ gp, sourceErrors, fetchSupText, pauseMs }) {
  const unchanged = (error, asked) => ({
    rows: gp,
    asked,
    outcome: { matched: 0, gpOnly: gp.length, supplementalOnly: 0, error },
  })
  if (gp.length === 0) return unchanged('not asked: no Starlink slice from active', false)
  const failedSources = Object.keys(sourceErrors)
  if (failedSources.length > 0)
    return unchanged(`not asked: ${failedSources.join(', ')} failed this run`, false)
  if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs))
  try {
    const sup = parseGroup(await fetchSupText(SUPGP_STARLINK_URL), 'SupGP starlink')
    const { rows, supplemental, supplementalOnly } = overlaySupplemental(gp, sup)
    const outcome = {
      matched: supplemental,
      gpOnly: gp.length - supplemental,
      supplementalOnly,
      error: null,
    }
    return { rows, asked: true, outcome }
  } catch (err) {
    return unchanged(err instanceof Error ? err.message : String(err), true)
  }
}

/**
 * Download every source group and build the stored payloads. A source that fails
 * takes only the groups made from it (and `other`, which needs every named group).
 * With `fetchSupText`, Starlink's elements come from SupGP where it has them (#209).
 */
export async function buildSatGroups({ now, fetchText, fetchSupText, pauseMs = DEFAULT_PAUSE_MS }) {
  const fetched = {}
  const sourceErrors = {}
  let requests = 0
  for (const [i, source] of CELESTRAK_FETCH.entries()) {
    if (i > 0 && pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs))
    requests += 1
    try {
      fetched[source] = parseGroup(await fetchText(celestrakGroupUrl(source)), source)
    } catch (err) {
      sourceErrors[source] = err instanceof Error ? err.message : String(err)
    }
  }

  const split = splitGroups(fetched)
  if (split.starlink?.length === 0) delete split.starlink
  let supplemental = null
  if (fetchSupText) {
    const gp = split.starlink ?? []
    const sup = await supplementStarlink({ gp, sourceErrors, fetchSupText, pauseMs })
    if (sup.asked) requests += 1
    if (gp.length > 0) split.starlink = sup.rows
    supplemental = sup.outcome
  }
  const generatedAt = new Date(now).toISOString()
  const groups = []
  const failed = []
  for (const spec of SAT_GROUPS) {
    const rows = split[spec.id]
    if (rows) {
      groups.push({
        id: spec.id,
        payload: {
          group: spec.id,
          label: spec.label,
          category: spec.category,
          source: 'celestrak',
          celestrakGroup: spec.source,
          generatedAt,
          fields: SAT_FIELDS,
          count: rows.length,
          // The first supgpCount rows carry SupGP elements (#209); Starlink only.
          ...(spec.id === 'starlink' ? { supgpCount: supplemental?.matched ?? 0 } : {}),
          rows,
        },
      })
      continue
    }
    const reason =
      sourceErrors[spec.source] ??
      (spec.id === 'starlink'
        ? 'no STARLINK-named objects in active'
        : `needs every named group (${Object.keys(sourceErrors).join(', ')} failed)`)
    failed.push({ group: spec.id, reason })
  }
  return { groups, failed, requests, supplemental }
}

/** The KV copy's generation time as the envelope classifyFailure reads. */
function envelopeOf(previousText) {
  if (previousText === null || previousText === undefined) return previousText
  try {
    return JSON.stringify({ fetchedAt: JSON.parse(previousText)?.generatedAt })
  } catch {
    return null
  }
}

/**
 * The refresh job's satellite step: one write per group that came back, and one
 * incident entry for the lot. A group that failed is only an incident once its KV copy
 * is past SATS_MAX_AGE_MS; `readPrevious` is asked for failed groups only, because a
 * stored group can be several megabytes.
 */
export async function refreshSatGroups({
  now,
  fetchText,
  fetchSupText,
  pauseMs,
  readPrevious,
  classifyFailure,
}) {
  const { groups, failed, requests, supplemental } = await buildSatGroups({
    now,
    fetchText,
    fetchSupText,
    pauseMs,
  })
  const writes = groups.map(({ id, payload }) => {
    const value = JSON.stringify(payload)
    return {
      key: SAT_KEY(id),
      value,
      metadata: { fetchedAt: payload.generatedAt, count: payload.count, bytes: value.length },
    }
  })

  const verdicts = []
  for (const f of failed) {
    const verdict = classifyFailure({
      err: new Error(f.reason),
      envelopeText: envelopeOf(await readPrevious(SAT_KEY(f.group))),
      maxAgeMs: SATS_MAX_AGE_MS,
      now,
    })
    verdicts.push(`${f.group}: ${verdict.detail}`)
    if (!verdict.ok) f.incident = true
  }

  const total = groups.reduce((n, g) => n + g.payload.count, 0)
  const summary = `${String(groups.length)} groups, ${String(total)} objects, ${String(requests)} requests${supplementalText(supplemental)}`
  const ok = failed.every((f) => !f.incident)
  // A SupGP failure is a warning, never an incident: Starlink is still stored, on GP.
  const warning = failed.length > 0 || Boolean(supplemental?.error)
  const detail = warning
    ? `${ok ? 'WARN' : 'FAIL'} ${SATS_SIGNATURE} ${summary}${verdicts.map((v) => `; ${v}`).join('')}`
    : `ok ${SATS_SIGNATURE} ${summary}`
  ;(ok ? (warning ? console.warn : console.log) : console.error)(detail)
  return {
    entry: { signature: SATS_SIGNATURE, ok, warning, detail },
    writes,
  }
}

/** The SupGP part of the step's line, or nothing when it wasn't part of the run. */
function supplementalText(s) {
  if (!s) return ''
  if (s.error) return `; SupGP: ${s.error}, Starlink on GP elements`
  const total = s.matched + s.gpOnly
  return `; SupGP ${String(s.matched)} of ${String(total)} Starlink (${String(s.supplementalOnly)} SupGP-only dropped)`
}
