// Space-Track.org for scripts/refresh-data.mjs (#101): re-entry predictions (TIP), the
// day's decay messages, the satellite catalogue (SATCAT), the Box Score, and the element
// history of a few famous objects (GP_HISTORY). Read with the owner's account, stored in
// KV as finished bodies, and never called on the request path.
//
// Space-Track's "API Use Guidelines" (https://www.space-track.org/documentation, read
// 2026-11-07) set the pace, see src/lib/spacetrack.ts:
//   "Limit API queries to less than 30 requests per 1 minute(s) and 300 requests per
//    1 hour(s)". One login, then at most a dozen requests a run, 3 s apart.
//
// The credentials go in the login form and nowhere else: not in a URL, an error, a log
// line or the payload. The session is a cookie, sent with each query, then logged out.

import { toRow } from '../src/lib/orbit/satCatalog.ts'
import {
  boxscoreUrl,
  bucketHistory,
  dailyDue,
  decayUrl,
  gpHistoryUrl,
  HISTORY_OBJECTS,
  historyPlan,
  mergeDecays,
  parseBoxscore,
  parseDecays,
  parseSatcat,
  parseTip,
  SATCAT_SHARDS,
  satcatShardOf,
  satcatUrl,
  SPACETRACK_CITATION,
  SPACETRACK_LOGIN,
  SPACETRACK_LOGOUT,
  tipUrl,
} from '../src/lib/spacetrack.ts'

/** 3 s apart: at most 20 a minute, under Space-Track's 30. */
export const DEFAULT_PAUSE_MS = 3000
/** A dozen requests at 3 s, with room for slow answers. */
export const DEFAULT_BUDGET_MS = 90_000
/** GP_HISTORY months asked per run: the backfill takes about a fortnight, then stops. */
export const HISTORY_PER_RUN = 6
/** Fewer on-orbit objects than this means a broken answer, not a smaller sky. */
export const MIN_SATCAT_ROWS = 10_000
const FETCH_TIMEOUT_MS = 60_000

class BudgetSpent extends Error {}

/** The account from the environment, or null when either half is missing. */
export function spaceTrackCredentials(env) {
  const identity = (env.SPACETRACK_USER ?? '').trim()
  const password = env.SPACETRACK_PASS ?? ''
  return identity && password.trim() ? { identity, password } : null
}

/** `name=value` pairs from Set-Cookie headers, joined for a Cookie header. */
function cookieOf(res) {
  const all =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*\w+=)/)
  return all
    .map((c) => c.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ')
}

/** Which query a URL is, for messages: the class name, never the whole URL. */
const classOf = (url) => /\/class\/([a-z_]+)\//.exec(url)?.[1] ?? 'query'

/**
 * A paced session: `ask(url)` waits its turn, refuses once the budget is spent, and
 * returns the parsed JSON.
 */
function session({ http, pauseMs, budgetMs, clock, sleep }) {
  const started = clock()
  let calls = 0
  let cookie = ''
  const turn = async (counted) => {
    if (calls > 0) {
      if (counted && clock() - started + pauseMs > budgetMs) throw new BudgetSpent()
      await sleep(pauseMs)
    }
    calls += 1
  }
  return {
    get requests() {
      return calls
    },
    async login({ identity, password }) {
      await turn(true)
      const res = await http(SPACETRACK_LOGIN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ identity, password }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      const body = await res.text()
      cookie = cookieOf(res)
      // Space-Track answers 200 either way; a refusal says {"Login":"Failed"}.
      if (!res.ok || /failed/i.test(body) || !cookie) {
        throw new Error(`Space-Track login failed (HTTP ${String(res.status)})`)
      }
    },
    async ask(url) {
      await turn(true)
      const res = await http(url, {
        headers: { Cookie: cookie, Accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      const body = await res.text()
      if (!res.ok) throw new Error(`${classOf(url)}: HTTP ${String(res.status)}`)
      let json
      try {
        json = JSON.parse(body)
      } catch {
        throw new Error(`${classOf(url)}: not JSON (${body.slice(0, 80).replace(/\s+/g, ' ')})`)
      }
      if (json && !Array.isArray(json) && typeof json === 'object' && 'error' in json) {
        throw new Error(`${classOf(url)}: ${String(json.error).slice(0, 120)}`)
      }
      return json
    },
    async logout() {
      if (!cookie) return
      await turn(false)
      try {
        await http(SPACETRACK_LOGOUT, {
          headers: { Cookie: cookie },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
      } catch {
        // Best effort: the session expires on its own.
      }
    },
  }
}

const reasonOf = (err) => (err instanceof Error ? err.message : String(err))

/** The stored history as a map, or empty. */
function historyMap(previous) {
  const map = new Map()
  for (const o of previous?.objects ?? []) map.set(o.noradId, { ...o, months: [...o.months], rows: [...o.rows] })
  return map
}

/**
 * One Space-Track run. Returns the catalogue payload (always), the SATCAT rows when they
 * were asked for today (else null), and the history payload when it gained months (else
 * null), plus the request count. A failed login throws; any other class that fails is
 * listed in `missing` and its last copy carried over.
 */
export async function buildSpaceTrack({
  now,
  credentials,
  http = fetch,
  previous = { catalog: null, history: null },
  pauseMs = DEFAULT_PAUSE_MS,
  budgetMs = DEFAULT_BUDGET_MS,
  historyPerRun = HISTORY_PER_RUN,
  minSatcatRows = MIN_SATCAT_ROWS,
  clock = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const nowIso = new Date(now).toISOString()
  const prev = previous.catalog
  const s = session({ http, pauseMs, budgetMs, clock, sleep })
  const missing = []
  let tip = prev?.tip ?? null
  let decays = prev?.decays ?? null
  let boxscore = prev?.boxscore ?? null
  let satcatAt = prev?.satcatAt ?? null
  let satcat = null
  const names = { ...prev?.names }
  const history = historyMap(previous.history)
  let historyChanged = false

  const attempt = async (id, fn) => {
    try {
      await fn()
    } catch (err) {
      if (err instanceof BudgetSpent) throw err
      missing.push({ id, reason: reasonOf(err) })
    }
  }

  await s.login(credentials)
  try {
    await attempt('tip', async () => {
      tip = { fetchedAt: nowIso, reentries: parseTip(await s.ask(tipUrl())) }
    })
    if (dailyDue(now, satcatAt)) {
      await attempt('satcat', async () => {
        const rows = parseSatcat(await s.ask(satcatUrl()))
        if (rows.length < minSatcatRows) {
          throw new Error(`only ${String(rows.length)} on-orbit objects`)
        }
        satcat = rows
        satcatAt = nowIso
      })
    }
    if (dailyDue(now, boxscore?.fetchedAt ?? null)) {
      await attempt('boxscore', async () => {
        boxscore = { fetchedAt: nowIso, ...parseBoxscore(await s.ask(boxscoreUrl())) }
      })
    }
    if (dailyDue(now, decays?.fetchedAt ?? null)) {
      await attempt('decay', async () => {
        const fresh = parseDecays(await s.ask(decayUrl()))
        for (const d of fresh) if (d.name) names[d.noradId] = d.name
        decays = { fetchedAt: nowIso, recent: mergeDecays(decays?.recent ?? [], fresh, now) }
      })
    }
    const fetched = Object.fromEntries([...history.values()].map((o) => [o.noradId, o.months]))
    for (const { noradId, month } of historyPlan(now, fetched, historyPerRun)) {
      await attempt(`history:${noradId}:${month}`, async () => {
        const json = await s.ask(gpHistoryUrl(noradId, month))
        if (!Array.isArray(json)) throw new Error('GP_HISTORY: not a list')
        const rows = bucketHistory(json)
          .map((o) => toRow(o))
          .filter((r) => r !== null)
        const spec = HISTORY_OBJECTS.find((o) => o.noradId === noradId)
        const had = history.get(noradId) ?? { noradId, name: spec?.name ?? noradId, months: [], rows: [] }
        const byEpoch = new Map(had.rows.map((r) => [r[3], r]))
        for (const r of rows) byEpoch.set(r[3], r)
        history.set(noradId, {
          ...had,
          months: [...had.months, month].sort(),
          rows: [...byEpoch.values()].sort((a, b) => a[3].localeCompare(b[3])),
        })
        historyChanged = true
      })
    }
  } catch (err) {
    if (!(err instanceof BudgetSpent)) throw err
    missing.push({ id: 'budget', reason: 'step budget spent; the rest waits for the next run' })
  } finally {
    await s.logout()
  }

  // Names only for what is listed now, so the map doesn't grow forever.
  const listed = new Set([
    ...(tip?.reentries ?? []).map((r) => r.noradId),
    ...(decays?.recent ?? []).map((d) => d.noradId),
  ])
  const keptNames = Object.fromEntries(Object.entries(names).filter(([id]) => listed.has(id)))

  const catalog = {
    generatedAt: nowIso,
    provider: 'Space-Track.org',
    citation: SPACETRACK_CITATION,
    tip,
    decays,
    boxscore,
    satcatAt,
    names: keptNames,
    missing,
  }
  return {
    catalog,
    satcat,
    history: historyChanged
      ? {
          generatedAt: nowIso,
          citation: SPACETRACK_CITATION,
          bucketDays: 7,
          objects: [...history.values()],
        }
      : null,
    requests: s.requests,
  }
}

/** SATCAT rows split into the stored shards, each a finished body. */
export function satcatShards(rows, nowIso) {
  const shards = Array.from({ length: SATCAT_SHARDS }, (_, shard) => ({
    generatedAt: nowIso,
    citation: SPACETRACK_CITATION,
    shard,
    rows: [],
  }))
  for (const r of rows) {
    const i = satcatShardOf(r[0])
    if (i !== null) shards[i].rows.push(r)
  }
  return shards
}
