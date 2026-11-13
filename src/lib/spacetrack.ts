/**
 * Space-Track.org (#101): the US Space Force's public catalogue, read by the refresh job
 * with the owner's account and stored in KV, never called on the request path.
 *
 * Plain TypeScript with no imports, so scripts/spacetrack.mjs can import it under Node's
 * type stripping (like satCatalog.ts and craft.ts). Keep it that way.
 *
 * What it reads, and how often (Space-Track's "API Use Guidelines", read 2026-11-07):
 * - TIP re-entry predictions: "1 / hour" at most; the job runs every 6 h.
 * - Decay, SATCAT, Box Score: "Once per day after 1700 (UTC)" (dailyDue).
 * - GP_HISTORY: "1 / lifetime ... Once you download an object's history, you need to store
 *   it on your own servers; do not download it again." Each completed month of a few
 *   famous objects is asked once and kept (historyPlan).
 * Redistribution: "USSPACECOM has provided express blanket approval for
 * transfer/redistribution of basic SSA data ... conditioned on appropriate citation",
 * where basic SSA data are "TLEs and OMMs; SATCAT; and Satellite Decay and Reentry Data".
 */

export const SPACETRACK_BASE = 'https://www.space-track.org'
export const SPACETRACK_LOGIN = `${SPACETRACK_BASE}/ajaxauth/login`
export const SPACETRACK_LOGOUT = `${SPACETRACK_BASE}/ajaxauth/logout`
const QUERY = `${SPACETRACK_BASE}/basicspacedata/query/class`

/** The credit every surface that shows this data carries. */
export const SPACETRACK_CITATION = 'Space-Track.org (USSPACECOM)'

const DAY_MS = 86_400_000
const WEEK_DAYS = 7
/** Re-entries already down stay listed this long. */
export const RECENT_DECAY_DAYS = 30
/** Ask TIP for messages this many days old at most: a prediction is reissued until it lands. */
const TIP_LOOKBACK_DAYS = 14
/** Daily classes are asked after this UTC hour, as Space-Track asks. */
const DAILY_HOUR_UTC = 17

/** SATCAT is split by NORAD id so the client fetches one small piece per satellite. */
export const SATCAT_SHARDS = 16
/** The SATCAT columns kept, in row order. */
export const SATCAT_FIELDS = [
  'NORAD_CAT_ID',
  'INTLDES',
  'OBJECT_TYPE',
  'COUNTRY',
  'LAUNCH',
  'SITE',
  'RCS_SIZE',
] as const
/** [NORAD id, international designator, object type, owner, launch date, site, radar size]. */
export type SatcatRow = [string, string, string, string, string, string, string]

/** The GP fields GP_HISTORY is asked for (what satellite.js's json2satrec reads). */
const GP_FIELDS = [
  'OBJECT_NAME',
  'OBJECT_ID',
  'NORAD_CAT_ID',
  'EPOCH',
  'MEAN_MOTION',
  'ECCENTRICITY',
  'INCLINATION',
  'RA_OF_ASC_NODE',
  'ARG_OF_PERICENTER',
  'MEAN_ANOMALY',
  'BSTAR',
  'MEAN_MOTION_DOT',
  'MEAN_MOTION_DDOT',
] as const

export interface HistoryObject {
  noradId: string
  name: string
  /** The first month asked for, `YYYY-MM`. */
  fromMonth: string
}

/**
 * Whose past the time slider can show. Ten years back at most (or from launch): weekly
 * element sets for these come to about 1,300 rows, a small payload, and 307 monthly
 * requests in all, spread over a fortnight of runs and then never asked again.
 */
export const HISTORY_OBJECTS: readonly HistoryObject[] = [
  { noradId: '25544', name: 'ISS (ZARYA)', fromMonth: '2016-01' },
  { noradId: '20580', name: 'HST', fromMonth: '2016-01' },
  { noradId: '48274', name: 'CSS (TIANHE)', fromMonth: '2021-05' },
]

export interface Reentry {
  noradId: string
  /** Predicted re-entry time, ISO UTC. */
  decayEpoch: string
  /** ± this many minutes around it. */
  windowMin: number
  /** When 18 SDS issued the message, ISO UTC. */
  msgEpoch: string
  /** Where it is predicted to come down, degrees (or null when not given). */
  lat: number | null
  lon: number | null
  highInterest: boolean
}

export interface DecayMessage {
  noradId: string
  name: string
  country: string
  decayEpoch: string
  msgEpoch: string
  kind: 'historical' | 'prediction'
}

export interface Boxscore {
  inOrbit: {
    payload: number
    rocketBody: number
    debris: number
    unassigned: number
    total: number
  }
  decayed: { payload: number; rocketBody: number; debris: number; total: number }
  catalogued: number
}

// ---------------------------------------------------------------- URLs

const enc = (segment: string) => encodeURIComponent(segment)

export function tipUrl(): string {
  return (
    `${QUERY}/tip/DECAY_EPOCH/${enc('>now')}/INSERT_EPOCH/${enc(`>now-${String(TIP_LOOKBACK_DAYS)}`)}` +
    `/orderby/${enc('DECAY_EPOCH asc')}/format/json`
  )
}

/**
 * The current GP elements of a few objects in one list query (#154): the objects TIP
 * says are coming down. One request, not one per object (Space-Track's guidelines rule
 * out hundreds of single-object queries). Ids are checked to be catalogue numbers, since
 * they go into the path.
 */
export function gpListUrl(noradIds: readonly string[]): string {
  if (noradIds.length === 0) throw new Error('GP: no NORAD ids')
  for (const id of noradIds) {
    if (!/^\d{1,9}$/.test(id)) throw new Error('GP: not a NORAD catalogue number')
  }
  return (
    `${QUERY}/gp/NORAD_CAT_ID/${noradIds.join(',')}` +
    `/predicates/${GP_FIELDS.join(',')}/format/json`
  )
}

export function decayUrl(): string {
  return `${QUERY}/decay/MSG_EPOCH/${enc('>now-1')}/orderby/${enc('DECAY_EPOCH desc')}/format/json`
}

export function satcatUrl(): string {
  return (
    `${QUERY}/satcat/CURRENT/Y/DECAY/null-val/predicates/${SATCAT_FIELDS.join(',')}` +
    `/orderby/${enc('NORAD_CAT_ID asc')}/format/json`
  )
}

export function boxscoreUrl(): string {
  return `${QUERY}/boxscore/format/json`
}

/** `YYYY-MM` plus `n` months. */
function addMonths(month: string, n: number): string {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7)) - 1 + n
  const yy = y + Math.floor(m / 12)
  const mm = ((m % 12) + 12) % 12
  return `${String(yy)}-${String(mm + 1).padStart(2, '0')}`
}

export function gpHistoryUrl(noradId: string, month: string): string {
  const range = `${month}-01--${addMonths(month, 1)}-01`
  return (
    `${QUERY}/gp_history/NORAD_CAT_ID/${enc(noradId)}/EPOCH/${range}` +
    `/predicates/${GP_FIELDS.join(',')}/orderby/${enc('EPOCH asc')}/format/json`
  )
}

// ---------------------------------------------------------------- schedule

/** Whether a daily class is due: after 17:00 UTC, and not yet asked since then. */
export function dailyDue(nowMs: number, lastIso: string | null): boolean {
  const now = new Date(nowMs)
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), DAILY_HOUR_UTC)
  if (nowMs < today) return false
  const last = lastIso === null ? Number.NaN : Date.parse(lastIso)
  return !Number.isFinite(last) || last < today
}

/**
 * The next GP_HISTORY requests: completed months only (a month asked while still running
 * would have to be asked again), newest first, taking each object in turn, skipping any
 * month already fetched, at most `limit`.
 */
export function historyPlan(
  nowMs: number,
  fetched: Readonly<Record<string, readonly string[]>>,
  limit: number,
  objects: readonly HistoryObject[] = HISTORY_OBJECTS,
): { noradId: string; month: string }[] {
  const now = new Date(nowMs)
  const current = `${String(now.getUTCFullYear())}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const queues = objects.map((o) => {
    const have = new Set(fetched[o.noradId] ?? [])
    const months: string[] = []
    for (let m = addMonths(current, -1); m >= o.fromMonth; m = addMonths(m, -1)) {
      if (!have.has(m)) months.push(m)
    }
    return { noradId: o.noradId, months }
  })
  const plan: { noradId: string; month: string }[] = []
  for (let i = 0; plan.length < limit; i += 1) {
    let any = false
    for (const q of queues) {
      const month = q.months[i]
      if (month === undefined) continue
      any = true
      if (plan.length < limit) plan.push({ noradId: q.noradId, month })
    }
    if (!any) break
  }
  return plan
}

// ---------------------------------------------------------------- parsers

/** Space-Track's `2026-11-07 0:00:00` (UTC, no zone) as ISO, or null. */
export function spaceTrackTime(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2}):(\d{2})/.exec(raw.trim())
  if (!m) return null
  const iso = `${m[1] ?? ''}T${(m[2] ?? '').padStart(2, '0')}:${m[3] ?? ''}:${m[4] ?? ''}Z`
  return Number.isFinite(Date.parse(iso)) ? iso : null
}

const text = (v: unknown): string =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string' || v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function records(json: unknown, what: string): Record<string, unknown>[] {
  if (!Array.isArray(json)) throw new Error(`${what}: Space-Track did not answer a list`)
  return json.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
}

/** TIP messages: the newest per object, soonest re-entry first. */
export function parseTip(json: unknown): Reentry[] {
  const latest = new Map<string, Reentry>()
  for (const r of records(json, 'TIP')) {
    const noradId = text(r['NORAD_CAT_ID'])
    const decayEpoch = spaceTrackTime(r['DECAY_EPOCH'])
    const msgEpoch = spaceTrackTime(r['MSG_EPOCH'])
    if (!noradId) throw new Error('TIP: a message without NORAD_CAT_ID')
    if (!decayEpoch) throw new Error(`TIP: no DECAY_EPOCH for ${noradId}`)
    const entry: Reentry = {
      noradId,
      decayEpoch,
      windowMin: num(r['WINDOW']) ?? 0,
      msgEpoch: msgEpoch ?? decayEpoch,
      lat: num(r['LAT']),
      lon: num(r['LON']),
      highInterest: text(r['HIGH_INTEREST']).toUpperCase() === 'Y',
    }
    const had = latest.get(noradId)
    if (!had || entry.msgEpoch > had.msgEpoch) latest.set(noradId, entry)
  }
  return [...latest.values()].sort((a, b) => a.decayEpoch.localeCompare(b.decayEpoch))
}

/** Decay messages: re-entries recorded, and the predictions issued, today. */
export function parseDecays(json: unknown): DecayMessage[] {
  const out: DecayMessage[] = []
  for (const r of records(json, 'Decay')) {
    const noradId = text(r['NORAD_CAT_ID'])
    const decayEpoch = spaceTrackTime(r['DECAY_EPOCH'])
    if (!noradId || !decayEpoch)
      throw new Error('Decay: a message without NORAD_CAT_ID or DECAY_EPOCH')
    out.push({
      noradId,
      name: text(r['OBJECT_NAME']) || text(r['SATNAME']),
      country: text(r['COUNTRY']),
      decayEpoch,
      msgEpoch: spaceTrackTime(r['MSG_EPOCH']) ?? decayEpoch,
      kind: text(r['MSG_TYPE']).toLowerCase() === 'prediction' ? 'prediction' : 'historical',
    })
  }
  return out
}

/**
 * Re-entries already down, kept for 30 days: the stored list plus today's messages, one
 * per object (the newest message wins), newest re-entry first. Predictions are left out:
 * TIP carries those.
 */
export function mergeDecays(
  previous: readonly DecayMessage[],
  fresh: readonly DecayMessage[],
  nowMs: number,
): DecayMessage[] {
  const since = nowMs - RECENT_DECAY_DAYS * DAY_MS
  const byId = new Map<string, DecayMessage>()
  for (const d of [...previous, ...fresh]) {
    if (d.kind !== 'historical' || Date.parse(d.decayEpoch) < since) continue
    const had = byId.get(d.noradId)
    if (!had || d.msgEpoch >= had.msgEpoch) byId.set(d.noradId, d)
  }
  return [...byId.values()].sort((a, b) => b.decayEpoch.localeCompare(a.decayEpoch))
}

/** The Box Score's ALL row. */
export function parseBoxscore(json: unknown): Boxscore {
  const all = records(json, 'Box Score').find(
    (r) =>
      text(r['COUNTRY']).toUpperCase() === 'ALL' || text(r['SPADOC_CD']).toUpperCase() === 'ALL',
  )
  if (!all) throw new Error('Box Score: no ALL row')
  const n = (key: string): number => {
    const v = num(all[key])
    if (v === null) throw new Error(`Box Score: no ${key}`)
    return v
  }
  return {
    inOrbit: {
      payload: n('ORBITAL_PAYLOAD_COUNT'),
      rocketBody: n('ORBITAL_ROCKET_BODY_COUNT'),
      debris: n('ORBITAL_DEBRIS_COUNT'),
      unassigned: n('ORBITAL_TBA'),
      total: n('ORBITAL_TOTAL_COUNT'),
    },
    decayed: {
      payload: n('DECAYED_PAYLOAD_COUNT'),
      rocketBody: n('DECAYED_ROCKET_BODY_COUNT'),
      debris: n('DECAYED_DEBRIS_COUNT'),
      total: n('DECAYED_TOTAL_COUNT'),
    },
    catalogued: n('COUNTRY_TOTAL'),
  }
}

/** SATCAT records as compact rows. */
export function parseSatcat(json: unknown): SatcatRow[] {
  return records(json, 'SATCAT').map((r) => {
    const id = text(r['NORAD_CAT_ID'])
    if (!id) throw new Error('SATCAT: a record without NORAD_CAT_ID')
    return [
      id,
      text(r['INTLDES']),
      text(r['OBJECT_TYPE']),
      text(r['COUNTRY']),
      text(r['LAUNCH']),
      text(r['SITE']),
      text(r['RCS_SIZE']),
    ]
  })
}

export interface SatcatEntry {
  noradId: string
  intlDes: string
  objectType: string
  country: string
  launch: string
  site: string
  rcsSize: string
}

/** An object's SATCAT row from a shard's rows, by name, or null when it isn't there. */
export function satcatEntryOf(rows: readonly SatcatRow[], noradId: string): SatcatEntry | null {
  const row = rows.find((r) => r[0] === noradId)
  if (!row) return null
  const [id, intlDes, objectType, country, launch, site, rcsSize] = row
  return { noradId: id, intlDes, objectType, country, launch, site, rcsSize }
}

/** Which SATCAT shard holds an object, or null for an id that isn't a number. */
export function satcatShardOf(noradId: string): number | null {
  if (!/^\d+$/.test(noradId)) return null
  return Number(noradId) % SATCAT_SHARDS
}

const weekOf = (epoch: string): number => {
  const ms = Date.parse(epoch.endsWith('Z') ? epoch : `${epoch}Z`)
  return Number.isFinite(ms) ? Math.floor(ms / DAY_MS / WEEK_DAYS) : Number.NaN
}

/**
 * GP_HISTORY element sets thinned to the first of each week (weeks start on Thursdays,
 * as 1970-01-01 did), oldest first. Sets without a readable epoch are dropped.
 */
export function bucketHistory(omms: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  const dated = omms
    .map((o) => ({ o, epoch: text(o['EPOCH']) }))
    .filter((d) => Number.isFinite(weekOf(d.epoch)))
    .sort((a, b) => a.epoch.localeCompare(b.epoch))
  const kept: Record<string, unknown>[] = []
  let week = Number.NaN
  for (const d of dated) {
    const w = weekOf(d.epoch)
    if (w === week) continue
    week = w
    kept.push(d.o)
  }
  return kept
}
