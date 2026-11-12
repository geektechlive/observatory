import { targetMatchesDesignation } from './closeApproach'
import { FIRST_DAY, isLookupSpan, LAST_DAY } from './lookupSpan'
import { cometDesignation, targetMatchesSmallBody } from './smallBodies'

// On-demand lookup of any small body (#100): the search string and trajectory request a
// visitor sends, the JPL URLs they turn into, and how SBDB's answer is read. Shared by
// /api/lookup, /api/trajectory and the orrery's search box. Every JPL request these
// build goes through the jpl-queue Durable Object, one at a time.

const SBDB = 'https://ssd-api.jpl.nasa.gov/sbdb.api'
const HORIZONS = 'https://ssd.jpl.nasa.gov/api/horizons.api'

const MIN_QUERY = 2
const MAX_QUERY = 40
/** Characters SBDB names and designations use: letters, digits, space, / - ' ʻ ( ) . */
const QUERY_CHARS = /^[\p{L}\p{N} /'ʻ().-]+$/u
/** A trailing wildcard needs this many characters before it, or it lists half the catalogue. */
const MIN_BEFORE_WILDCARD = 3

export type LookupQuery = { ok: true; q: string } | { ok: false; reason: string }

/** A visitor's search string, normalised (it is also the cache key) or refused. */
export function parseLookupQuery(raw: string | null): LookupQuery {
  const q = (raw ?? '').normalize('NFC').trim().replace(/\s+/g, ' ')
  if (q.length < MIN_QUERY) return { ok: false, reason: 'Type at least two characters' }
  if (q.length > MAX_QUERY) return { ok: false, reason: 'Too long for a name or designation' }
  const wild = q.endsWith('*')
  const stem = wild ? q.slice(0, -1) : q
  if (stem.includes('*')) return { ok: false, reason: 'A * may only end the search' }
  if (wild && stem.trim().length < MIN_BEFORE_WILDCARD) {
    return { ok: false, reason: 'Put at least three characters before a *' }
  }
  if (!QUERY_CHARS.test(stem)) return { ok: false, reason: 'Unexpected characters' }
  return { ok: true, q }
}

export function sbdbLookupUrl(q: string): string {
  return `${SBDB}?${new URLSearchParams({ sstr: q }).toString()}`
}

export function sbdbSpkUrl(spkid: string): string {
  return `${SBDB}?${new URLSearchParams({ spk: spkid }).toString()}`
}

export type LookupKind = 'asteroid' | 'comet'

export interface LookupObject {
  /** Namespaced, as the orrery's other ids: `sb:<SPK-ID>`. */
  id: string
  spkid: string
  /** SBDB's full name, "99942 Apophis (2004 MN4)". */
  name: string
  /** SBDB's primary designation, "99942", "2025 N1", "1P". */
  designation: string
  /** A comet's prefix (C, P, I…); null for an asteroid. */
  prefix: string | null
  kind: LookupKind
  orbitClass: { code: string; name: string } | null
  neo: boolean
  pha: boolean
}

export interface LookupMatch {
  designation: string
  name: string
}

export type LookupResult =
  | { type: 'object'; object: LookupObject }
  | { type: 'list'; count: number; matches: LookupMatch[] }
  | { type: 'none' }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/** SBDB's kind: "an"/"au" numbered/unnumbered asteroid, "cn"/"cu" comet. */
function kindOf(code: unknown): LookupKind | null {
  if (code === 'an' || code === 'au') return 'asteroid'
  if (code === 'cn' || code === 'cu') return 'comet'
  return null
}

function readObject(o: Record<string, unknown>): LookupObject | null {
  const spkid = str(o['spkid'])
  const designation = str(o['des'])
  const kind = kindOf(o['kind'])
  if (!spkid || !/^\d+$/.test(spkid) || !designation || !kind) return null
  const oc = o['orbit_class']
  const code = isRecord(oc) ? str(oc['code']) : null
  const ocName = isRecord(oc) ? str(oc['name']) : null
  return {
    id: `sb:${spkid}`,
    spkid,
    name: str(o['fullname']) ?? designation,
    designation,
    prefix: str(o['prefix']),
    kind,
    orbitClass: code && ocName ? { code, name: ocName } : null,
    neo: o['neo'] === true,
    pha: o['pha'] === true,
  }
}

/**
 * SBDB's answer to `sstr=` or `spk=`: one object, a list of matches (HTTP 300, code
 * "300"), or "specified object was not found" (code "200"). Null for anything else.
 */
export function parseSbdbLookup(json: unknown): LookupResult | null {
  if (!isRecord(json)) return null
  if (isRecord(json['object'])) {
    const object = readObject(json['object'])
    return object ? { type: 'object', object } : null
  }
  if (Array.isArray(json['list'])) {
    const matches = json['list'].flatMap((m): LookupMatch[] => {
      if (!isRecord(m)) return []
      const designation = str(m['pdes'])
      return designation ? [{ designation, name: str(m['name']) ?? designation }] : []
    })
    const count = Number(json['count'])
    return { type: 'list', count: Number.isFinite(count) ? count : matches.length, matches }
  }
  if (json['code'] === '200' && typeof json['message'] === 'string') return { type: 'none' }
  return null
}

/**
 * Horizons' COMMAND for a looked-up object, by SPK-ID: `DES=20000433;` answered 433 Eros
 * (checked live 2026-11-07). A comet needs CAP;NOFRAG, or a periodic comet lists every
 * apparition instead of answering (#99).
 */
export function lookupCommand(object: LookupObject): string {
  return object.kind === 'comet' ? `DES=${object.spkid};CAP;NOFRAG` : `DES=${object.spkid};`
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Whether Horizons' "Target body name" is the object asked for (the `DES=433` lesson). */
export function lookupTargetMatches(object: LookupObject, target: string | null): boolean {
  if (!target) return false
  if (object.kind === 'comet') {
    return targetMatchesSmallBody(
      cometDesignation(object.prefix ?? 'C', object.designation),
      target,
    )
  }
  if (/^\d+$/.test(object.designation)) return targetMatchesDesignation(object.designation, target)
  // "(2026 VP1)", or an interstellar asteroid's "(A/2017 U1)".
  return new RegExp(`[(/]${escapeRegExp(object.designation)}\\)`).test(target)
}

// ---------------------------------------------------------------- trajectories

/** The most samples one trajectory request may ask for. */
export const MAX_TRAJECTORY_SAMPLES = 600
/** Horizons covers most small bodies across this range; outside it, refuse. */
const MIN_DATE = FIRST_DAY
const MAX_DATE = LAST_DAY
/** 10 minutes: a close pass's dense span (#215), as the refresh job's for #142. */
const MIN_STEP_MINUTES = 10

export interface TrajectoryRequest {
  spkid: string
  /** YYYY-MM-DD, TDB. */
  start: string
  end: string
  stepMinutes: number
}

export type TrajectoryParams =
  { ok: true; value: TrajectoryRequest } | { ok: false; reason: string }

/** Milliseconds for a real calendar date, else NaN (2026-02-30 is NaN, not March 2). */
function dateMs(s: string | null): number {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return Number.NaN
  const ms = Date.parse(`${s}T00:00:00Z`)
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === s ? ms : Number.NaN
}

function stepMinutesOf(s: string | null): number {
  const m = /^(\d{1,4})([mhd])$/.exec(s ?? '')
  if (!m) return Number.NaN
  const n = Number(m[1])
  return m[2] === 'd' ? n * 1440 : m[2] === 'h' ? n * 60 : n
}

/**
 * `id=sb:<SPK-ID>&start=YYYY-MM-DD&end=YYYY-MM-DD&step=<n>m|<n>h|<n>d`, checked and capped,
 * and only a span the orrery asks for (`isLookupSpan`, #223): each new one is a Horizons
 * request against the queue's daily budget. No leading zero, which would be a second key.
 */
export function parseTrajectoryParams(p: URLSearchParams): TrajectoryParams {
  const id = /^sb:([1-9]\d{0,9})$/.exec(p.get('id') ?? '')
  if (!id?.[1]) return { ok: false, reason: 'id must be sb:<SPK-ID>' }
  const start = p.get('start')
  const end = p.get('end')
  const startMs = dateMs(start)
  const endMs = dateMs(end)
  if (!start || !end || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { ok: false, reason: 'start and end must be dates, YYYY-MM-DD' }
  }
  if (endMs <= startMs) return { ok: false, reason: 'end must be after start' }
  if (start < MIN_DATE || end > MAX_DATE) {
    return { ok: false, reason: `dates must fall between ${MIN_DATE} and ${MAX_DATE}` }
  }
  const stepMinutes = stepMinutesOf(p.get('step'))
  if (!Number.isFinite(stepMinutes) || stepMinutes < MIN_STEP_MINUTES) {
    return { ok: false, reason: 'step must be <n>m, <n>h or <n>d, at least 10m' }
  }
  const value = { spkid: id[1], start, end, stepMinutes }
  if (trajectorySampleCount(value) > MAX_TRAJECTORY_SAMPLES) {
    return { ok: false, reason: `at most ${String(MAX_TRAJECTORY_SAMPLES)} samples` }
  }
  if (!isLookupSpan(start, end, stepMinutes)) {
    return { ok: false, reason: 'not a span the orrery asks for (2-day grid or a close pass)' }
  }
  return { ok: true, value }
}

/** Horizons' STEP_SIZE, as the refresh job writes it: whole days, else whole hours, else minutes. */
function stepSize(minutes: number): string {
  if (minutes % 1440 === 0) return `${String(minutes / 1440)} d`
  return minutes % 60 === 0 ? `${String(minutes / 60)} h` : `${String(minutes)} m`
}

/** A VECTORS request matching the refresh job's: Sun-centred ecliptic J2000, au and au/day. */
export function horizonsTrajectoryUrl(command: string, req: TrajectoryRequest): string {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${command}'`,
    EPHEM_TYPE: 'VECTORS',
    CENTER: "'500@10'",
    REF_PLANE: 'ECLIPTIC',
    REF_SYSTEM: 'ICRF',
    OUT_UNITS: 'AU-D',
    VEC_TABLE: '2',
    CSV_FORMAT: 'YES',
    START_TIME: `'${req.start}'`,
    STOP_TIME: `'${req.end}'`,
    STEP_SIZE: `'${stepSize(req.stepMinutes)}'`,
  })
  return `${HORIZONS}?${params.toString()}`
}

/** How many samples a trajectory request yields, ends included. */
export function trajectorySampleCount(req: TrajectoryRequest): number {
  return Math.floor((dateMs(req.end) - dateMs(req.start)) / (req.stepMinutes * 60_000)) + 1
}
