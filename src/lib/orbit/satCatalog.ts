/**
 * The orrery's satellite catalogue (#98): CelesTrak GP data as OMM, trimmed by the
 * refresh job into compact rows and stored per group in KV, then read back in the
 * propagation worker for satellite.js's json2satrec.
 *
 * Plain TypeScript with no imports, so scripts/refresh-data.mjs can import it under
 * Node's type stripping (like src/lib/orrery/craft.ts). Keep it that way.
 *
 * Groups are disjoint: every object is stored once, so the client never downloads one
 * twice. Starlink is cut out of CelesTrak's `active` group by name (the `starlink`
 * group equalled the STARLINK-named objects in `active`, 11,204 each, 2026-11-07), and
 * their elements are then replaced by CelesTrak's supplemental GP, from SpaceX's own
 * ephemerides, where it has them (#209, `overlaySupplemental`). `other` is whatever in
 * `active` is in no named group.
 */

export type SatGroupId =
  | 'stations'
  | 'starlink'
  | 'gps-ops'
  | 'weather'
  | 'science'
  | 'other'
  | 'cosmos-2251-debris'
  | 'iridium-33-debris'
  | 'fengyun-1c-debris'

/**
 * The group of the objects Space-Track predicts will re-enter (#154): loaded into the
 * field whatever the switches say, from rows the refresh job stored in the Space-Track
 * catalogue, not from a CelesTrak group. Not in SAT_GROUPS: it has no switch, no body of
 * its own and no place in the controls.
 */
export const REENTRY_GROUP = 'reentry'

/** A span of the loaded field: one of the switchable groups, or the re-entry objects. */
export type SatFieldGroup = SatGroupId | typeof REENTRY_GROUP

export type SatCategory =
  'station' | 'starlink' | 'navigation' | 'weather' | 'science' | 'other' | 'debris'

export interface SatGroupSpec {
  readonly id: SatGroupId
  readonly label: string
  readonly category: SatCategory
  /** The CelesTrak group the rows come from. */
  readonly source: string
}

export const SAT_GROUPS: readonly SatGroupSpec[] = [
  { id: 'stations', label: 'Space stations', category: 'station', source: 'stations' },
  { id: 'starlink', label: 'Starlink', category: 'starlink', source: 'active' },
  { id: 'gps-ops', label: 'GPS', category: 'navigation', source: 'gps-ops' },
  { id: 'weather', label: 'Weather', category: 'weather', source: 'weather' },
  { id: 'science', label: 'Science', category: 'science', source: 'science' },
  { id: 'other', label: 'Other active', category: 'other', source: 'active' },
  {
    id: 'cosmos-2251-debris',
    label: 'Cosmos 2251 debris',
    category: 'debris',
    source: 'cosmos-2251-debris',
  },
  {
    id: 'iridium-33-debris',
    label: 'Iridium 33 debris',
    category: 'debris',
    source: 'iridium-33-debris',
  },
  {
    id: 'fengyun-1c-debris',
    label: 'Fengyun-1C debris',
    category: 'debris',
    source: 'fengyun-1c-debris',
  },
]

/** The CelesTrak groups the refresh job downloads, in order. */
export const CELESTRAK_FETCH: readonly string[] = [
  'active',
  'stations',
  'gps-ops',
  'weather',
  'science',
  'cosmos-2251-debris',
  'iridium-33-debris',
  'fengyun-1c-debris',
]

/** Column order of a stored row. */
export const SAT_FIELDS = [
  'name',
  'id',
  'cospar',
  'epoch',
  'meanMotion',
  'eccentricity',
  'inclination',
  'raan',
  'argPericenter',
  'meanAnomaly',
  'bstar',
  'meanMotionDot',
  'meanMotionDdot',
] as const

/** [name, NORAD id, COSPAR id, epoch (ISO, UTC), then the eight mean elements and drag terms]. */
export type SatRow = [
  string,
  string,
  string,
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]

/** SGP4 elements drift; an object is drawn only within this of its own epoch (spec). */
export const EPOCH_WINDOW_MS = 3 * 86_400_000

const OMM_NUMBERS = [
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

/** CelesTrak gives epochs without a zone; they are UTC. */
function epochText(raw: string): string {
  return raw.endsWith('Z') ? raw : `${raw}Z`
}

/** One CelesTrak OMM record as a row, or null when it can't be propagated. */
export function toRow(omm: Record<string, unknown>): SatRow | null {
  const name = omm['OBJECT_NAME']
  const id = omm['NORAD_CAT_ID']
  const cospar = omm['OBJECT_ID']
  const epoch = omm['EPOCH']
  if (typeof name !== 'string' || typeof epoch !== 'string') return null
  if (typeof id !== 'number' && typeof id !== 'string') return null
  if (String(id).trim() === '') return null
  if (!Number.isFinite(Date.parse(epochText(epoch)))) return null
  const numbers: number[] = []
  for (const key of OMM_NUMBERS) {
    const value = omm[key]
    const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
    if (!Number.isFinite(n)) return null
    numbers.push(n)
  }
  return [
    name.trim(),
    String(id),
    typeof cospar === 'string' ? cospar : '',
    epoch,
    ...(numbers as [number, number, number, number, number, number, number, number, number]),
  ]
}

/** The row back as the OMM fields json2satrec reads (satellite.js 7 io.js). */
export function rowToOmm(row: SatRow): {
  OBJECT_NAME: string
  OBJECT_ID: string
  NORAD_CAT_ID: string
  EPOCH: string
  MEAN_MOTION: number
  ECCENTRICITY: number
  INCLINATION: number
  RA_OF_ASC_NODE: number
  ARG_OF_PERICENTER: number
  MEAN_ANOMALY: number
  BSTAR: number
  MEAN_MOTION_DOT: number
  MEAN_MOTION_DDOT: number
  ELEMENT_SET_NO: number
} {
  return {
    OBJECT_NAME: row[0],
    NORAD_CAT_ID: row[1],
    OBJECT_ID: row[2],
    EPOCH: row[3],
    MEAN_MOTION: row[4],
    ECCENTRICITY: row[5],
    INCLINATION: row[6],
    RA_OF_ASC_NODE: row[7],
    ARG_OF_PERICENTER: row[8],
    MEAN_ANOMALY: row[9],
    BSTAR: row[10],
    MEAN_MOTION_DOT: row[11],
    MEAN_MOTION_DDOT: row[12],
    // Required by the OMM type; SGP4 never reads it.
    ELEMENT_SET_NO: 999,
  }
}

/** A row's element epoch, ms since 1970 (UTC). */
export function rowEpochMs(row: SatRow): number {
  return Date.parse(epochText(row[3]))
}

/**
 * Whether a value is a stored row: four strings, nine finite numbers, a readable epoch.
 * Written by hand, with no schema library: rows arrive from KV and from Space-Track's
 * catalogue, and a zod tuple per row costs too much across 11,000 Starlinks.
 */
export function isSatRow(value: unknown): value is SatRow {
  if (!Array.isArray(value) || value.length !== 13) return false
  for (let i = 0; i < 4; i++) if (typeof value[i] !== 'string') return false
  for (let i = 4; i < 13; i++)
    if (typeof value[i] !== 'number' || !Number.isFinite(value[i])) return false
  return Number.isFinite(rowEpochMs(value as SatRow))
}

/**
 * Whether SGP4 can take the row now: well-formed, a mean motion above zero, an
 * eccentricity under one, an inclination a real angle, and an epoch within the window the
 * orrery draws (EPOCH_WINDOW_MS) of `nowMs`. The refresh job's health probe uses it for
 * the re-entry objects' rows (#154), where no satellite library is installed.
 */
export function rowCanPropagate(value: unknown, nowMs: number): boolean {
  if (!isSatRow(value)) return false
  const [, , , , meanMotion, eccentricity, inclination] = value
  return (
    meanMotion > 0 &&
    eccentricity >= 0 &&
    eccentricity < 1 &&
    inclination >= 0 &&
    inclination <= 180 &&
    Math.abs(nowMs - rowEpochMs(value)) <= EPOCH_WINDOW_MS
  )
}

/**
 * Starlink with CelesTrak's supplemental GP laid over it (#209): SupGP's elements,
 * fitted to SpaceX's own published ephemerides, replace the radar-based GP elements
 * object by object (keyed on NORAD id). SupGP objects the GP slice lacks are dropped, so
 * every object stays in exactly one group. The replaced rows come first, so a stored
 * group says which rows are SupGP with one count (`supgpCount`).
 */
export function overlaySupplemental(
  gp: readonly SatRow[],
  sup: readonly SatRow[],
): { rows: SatRow[]; supplemental: number; supplementalOnly: number } {
  const gpIds = new Set(gp.map((row) => row[1]))
  const newest = new Map<string, SatRow>()
  let supplementalOnly = 0
  for (const row of sup) {
    if (!gpIds.has(row[1])) {
      supplementalOnly += 1
      continue
    }
    const held = newest.get(row[1])
    if (!held || rowEpochMs(row) > rowEpochMs(held)) newest.set(row[1], row)
  }
  const replaced: SatRow[] = []
  const kept: SatRow[] = []
  for (const row of gp) {
    const better = newest.get(row[1])
    if (better) replaced.push(better)
    else kept.push(row)
  }
  return { rows: [...replaced, ...kept], supplemental: replaced.length, supplementalOnly }
}

/**
 * The fetched CelesTrak groups (rows per CelesTrak group name) as the stored groups.
 * A group whose source failed is left out rather than stored empty; `other` needs
 * every named group, or it would swallow their objects.
 */
export function splitGroups(
  fetched: Partial<Record<string, SatRow[]>>,
): Partial<Record<SatGroupId, SatRow[]>> {
  const out: Partial<Record<SatGroupId, SatRow[]>> = {}
  const named = new Set<string>()
  for (const spec of SAT_GROUPS) {
    if (spec.source === 'active') continue
    const rows = fetched[spec.source]
    if (!rows) continue
    out[spec.id] = rows
    for (const row of rows) named.add(row[1])
  }
  const active = fetched['active']
  if (active) {
    out.starlink = active.filter((row) => row[0].startsWith('STARLINK'))
    const namedComplete = ['stations', 'gps-ops', 'weather', 'science'].every(
      (g) => fetched[g] !== undefined,
    )
    if (namedComplete)
      out.other = active.filter((row) => !row[0].startsWith('STARLINK') && !named.has(row[1]))
  }
  return out
}
