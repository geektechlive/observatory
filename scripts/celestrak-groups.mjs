// The orrery's satellites (#98): CelesTrak GP data as OMM JSON, trimmed to compact
// rows (src/lib/orbit/satCatalog.ts) and written to KV as one finished body per group,
// `celestrak:gp:<group>:v1`, for /api/orrery-sats to stream through.
//
// CelesTrak refuses Cloudflare Workers egress (docs/reference/data-feeds-and-monitoring.md, "Upstream quirks"), so this runs in
// the refresh job. Eight downloads, one at a time with a pause, every 6 h: inside
// CelesTrak's guidance not to fetch the same data more than once per update (~2 h).
// Starlink comes out of `active` (see satCatalog.ts), so its 4.7 MB group is never
// downloaded on its own.

import {
  CELESTRAK_FETCH,
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
 * Download every source group and build the stored payloads. A source that fails
 * takes only the groups made from it (and `other`, which needs every named group).
 */
export async function buildSatGroups({ now, fetchText, pauseMs = DEFAULT_PAUSE_MS }) {
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
  return { groups, failed, requests }
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
export async function refreshSatGroups({ now, fetchText, pauseMs, readPrevious, classifyFailure }) {
  const { groups, failed, requests } = await buildSatGroups({ now, fetchText, pauseMs })
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
  const summary = `${String(groups.length)} groups, ${String(total)} objects, ${String(requests)} requests`
  const ok = failed.every((f) => !f.incident)
  const detail = failed.length
    ? `${ok ? 'WARN' : 'FAIL'} ${SATS_SIGNATURE} ${summary}; ${verdicts.join('; ')}`
    : `ok ${SATS_SIGNATURE} ${summary}`
  ;(ok ? (failed.length ? console.warn : console.log) : console.error)(detail)
  return {
    entry: { signature: SATS_SIGNATURE, ok, warning: failed.length > 0, detail },
    writes,
  }
}
