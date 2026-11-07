// Close-approach data for the orrery (#92): parsers for JPL's Close Approach Data (CAD)
// and Scout APIs and ESA NEOCC's flat files, and how a small body is named to Horizons.
//
// Plain TypeScript with no imports and nothing but erasable syntax, so
// scripts/orrery-neo.mjs can import it directly under Node's type stripping, as
// src/lib/horizons.ts is (#93).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A JSON cell as text: strings as they are, numbers written out, anything else empty. */
function str(value: unknown): string {
  if (typeof value === 'string') return value
  return typeof value === 'number' ? String(value) : ''
}

/** A number, or null for a missing or unreadable cell. */
function num(value: unknown): number | null {
  const text = str(value).trim()
  if (text === '' || text.toLowerCase() === 'n/a') return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

/** A parsed JSON object, or null for anything else. */
function asRecord(json: unknown): Record<string, unknown> | null {
  return typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : null
}

/** "YYYY-MM-DD HH:MM" (UTC) as ISO, or null. */
function isoMinutes(text: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(text.trim())
  if (!m) return null
  return new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])),
  ).toISOString()
}

// ---------------------------------------------------------------- JPL CAD

/** One close approach to Earth, from https://ssd-api.jpl.nasa.gov/cad.api. */
export interface CadApproach {
  /** JPL's designation: a number for numbered objects ("524522"), else "2026 UE2". */
  des: string
  /** Full name, trimmed: "524522 Zoozve (2002 VE68)" or "(2026 UE2)". */
  name: string
  orbitId: string
  /** Time of closest approach, Julian date (TDB). */
  jd: number
  /** The same, as ISO (CAD's calendar date is TDB to the minute; read as UTC). */
  date: string
  /** Nominal miss distance, au. */
  distAu: number
  /** The 3-sigma minimum and maximum miss distance, au. */
  distMinAu: number
  distMaxAu: number
  /** Speed relative to Earth at closest approach, and at infinity, km/s. */
  vRelKms: number
  vInfKms: number | null
  /** 3-sigma uncertainty in the time of closest approach, as CAD writes it ("< 00:01"). */
  tSigma: string
  /** Absolute magnitude. */
  h: number | null
  /** Diameter, km, when known (rarely, for small NEOs). */
  diameterKm: number | null
}

const CAD_REQUIRED = ['des', 'jd', 'cd', 'dist', 'dist_min', 'dist_max', 'v_rel'] as const

function cadTable(json: unknown): { fields: string[]; data: unknown[][] } {
  const body = asRecord(json)
  if (!body || !Array.isArray(body.fields)) throw new Error('not a JPL CAD answer: no fields list')
  const fields = (body.fields as unknown[]).map(str)
  for (const name of CAD_REQUIRED) {
    if (!fields.includes(name)) throw new Error(`CAD answer is missing the ${name} field`)
  }
  // CAD leaves `data` out entirely when nothing matches.
  const data = Array.isArray(body.data) ? (body.data as unknown[][]) : []
  return { fields, data }
}

/** Rows of a CAD answer, read by field name so a reordered answer still parses. */
export function cadApproaches(json: unknown): CadApproach[] {
  const { fields, data } = cadTable(json)
  const at = (row: unknown[], name: string): unknown => row[fields.indexOf(name)]
  const rows: CadApproach[] = []
  for (const row of data) {
    const des = str(at(row, 'des')).trim()
    const jd = num(at(row, 'jd'))
    const dist = num(at(row, 'dist'))
    const distMin = num(at(row, 'dist_min'))
    const distMax = num(at(row, 'dist_max'))
    const vRel = num(at(row, 'v_rel'))
    const date = cadDate(str(at(row, 'cd')))
    if (!des || jd === null || dist === null || distMin === null || distMax === null) continue
    if (vRel === null || date === null) continue
    const fullname = str(at(row, 'fullname')).trim()
    rows.push({
      des,
      name: fullname || des,
      orbitId: str(at(row, 'orbit_id')),
      jd,
      date,
      distAu: dist,
      distMinAu: distMin,
      distMaxAu: distMax,
      vRelKms: vRel,
      vInfKms: num(at(row, 'v_inf')),
      tSigma: str(at(row, 't_sigma_f')),
      h: num(at(row, 'h')),
      diameterKm: num(at(row, 'diameter')),
    })
  }
  return rows
}

/** CAD's "2026-Oct-28 04:04" as ISO. */
function cadDate(text: string): string | null {
  const m = /^(\d{4})-([A-Za-z]{3})-(\d{2}) (\d{2}):(\d{2})$/.exec(text.trim())
  if (!m) return null
  const month = MONTHS.indexOf(m[2] ?? '')
  if (month < 0) return null
  return new Date(
    Date.UTC(Number(m[1]), month, Number(m[3]), Number(m[4]), Number(m[5])),
  ).toISOString()
}

/** The designations in a CAD answer: how the `pha=true` query marks hazardous objects. */
export function cadDesignations(json: unknown): Set<string> {
  return new Set(cadApproaches(json).map((r) => r.des))
}

export interface SelectedApproach extends CadApproach {
  /** On CAD's potentially-hazardous list (MOID ≤ 0.05 au and H ≤ 22). */
  pha: boolean
}

/**
 * Up to `limit` objects for the orrery: one row per object (its closest approach in
 * the window), potentially hazardous objects first, then the closest. Each one costs
 * a Horizons request, so the limit is the job's budget, not a display choice.
 */
export function selectApproaches(
  rows: CadApproach[],
  pha: Set<string>,
  limit: number,
): SelectedApproach[] {
  const closest = new Map<string, CadApproach>()
  for (const row of rows) {
    const seen = closest.get(row.des)
    if (!seen || row.distAu < seen.distAu) closest.set(row.des, row)
  }
  return [...closest.values()]
    .map((row) => ({ ...row, pha: pha.has(row.des) }))
    .sort((a, b) => Number(b.pha) - Number(a.pha) || a.distAu - b.distAu || a.jd - b.jd)
    .slice(0, limit)
}

// ---------------------------------------------------------------- Horizons naming

/** A numbered object: JPL writes its number alone ("524522"). */
export function isNumbered(des: string): boolean {
  return /^\d+$/.test(des)
}

/**
 * Horizons' COMMAND for a small body. A numbered asteroid is "433;": DES=433; matches
 * the designation text and returns 248370 (2005 QN173), checked live 2026-11-07. DES=
 * is for provisional designations only. The trailing ";" means "small body".
 */
export function horizonsSmallBodyCommand(des: string): string {
  return isNumbered(des) ? `${des};` : `DES=${des};`
}

/**
 * Whether Horizons' "Target body name" is the object asked for. Numbered objects are
 * named "433 Eros (A898 PA)", provisional ones "(2026 UE2)".
 */
export function targetMatchesDesignation(des: string, target: string | null): boolean {
  if (!target) return false
  if (isNumbered(des)) return new RegExp(`^${des}(?:\\s|\\(|$)`).test(target.trim())
  return target.includes(`(${des})`)
}

// ---------------------------------------------------------------- JPL Scout

/** A recent, unconfirmed object from https://ssd-api.jpl.nasa.gov/scout.api. */
export interface ScoutObject {
  /** The temporary designation on the NEO Confirmation Page ("6L42B21"). */
  objectName: string
  /** 0-100: how likely it is a NEO, a PHA, a 1 km+ NEO, or on an Earth-impact orbit. */
  neoScore: number | null
  phaScore: number | null
  neo1kmScore: number | null
  ieoScore: number | null
  geocentricScore: number | null
  tisserandScore: number | null
  /** Scout's 0-4 rating of the orbit's quality and the object's interest. */
  rating: number | null
  /** Plane-of-sky position uncertainty now, and 1 day ahead, arcmin. */
  unc: number | null
  uncP1: number | null
  /** Closest approach distance, lunar distances (Scout's caDist). */
  caDistLd: number | null
  moidAu: number | null
  vInfKms: number | null
  h: number | null
  vMag: number | null
  nObs: number | null
  /** Observed arc, hours. */
  arcHours: number | null
  rmsN: number | null
  /** When Scout last computed it, ISO. */
  lastRun: string | null
}

export function scoutObjects(json: unknown): ScoutObject[] {
  const body = asRecord(json)
  if (!body || !Array.isArray(body.data)) throw new Error('not a JPL Scout answer: no data list')
  return (body.data as unknown[])
    .map(asRecord)
    .filter((o): o is Record<string, unknown> => typeof o?.objectName === 'string')
    .map((o) => ({
      objectName: str(o.objectName),
      neoScore: num(o.neoScore),
      phaScore: num(o.phaScore),
      neo1kmScore: num(o.neo1kmScore),
      ieoScore: num(o.ieoScore),
      geocentricScore: num(o.geocentricScore),
      tisserandScore: num(o.tisserandScore),
      rating: num(o.rating),
      unc: num(o.unc),
      uncP1: num(o.uncP1),
      caDistLd: num(o.caDist),
      moidAu: num(o.moid),
      vInfKms: num(o.vInf),
      h: num(o.H),
      vMag: num(o.Vmag),
      nObs: num(o.nObs),
      arcHours: num(o.arc),
      rmsN: num(o.rmsN),
      lastRun: isoMinutes(str(o.lastRun)),
    }))
}

// ---------------------------------------------------------------- ESA NEOCC

/**
 * NEOCC writes "2026VZ3"; JPL writes "2026 VZ3". Anything that is not a provisional
 * designation (a number, a name) comes back unchanged.
 */
export function neoccDesignation(raw: string): string {
  const m = /^(\d{4})([A-Z]{1,2}\d*)$/.exec(raw.trim())
  return m ? `${m[1] ?? ''} ${m[2] ?? ''}` : raw.trim()
}

interface NeoccObject {
  /** The key that matches JPL's `des`: the number if numbered, else the designation. */
  key: string
  number: string | null
  designation: string | null
  name: string | null
}

/** NEOCC's first column: "2008JL3", "443104               2013XK22", or a name. */
function neoccObject(cell: string): NeoccObject {
  const [first = '', ...rest] = cell.trim().split(/\s+/)
  const second = rest.join(' ')
  if (/^\d+$/.test(first)) {
    const provisional = /^\d{4}[A-Z]{1,2}\d*$/.test(second)
    return {
      key: first,
      number: first,
      designation: provisional ? neoccDesignation(second) : null,
      name: !provisional && second ? second : null,
    }
  }
  const designation = neoccDesignation(first)
  return { key: designation, number: null, designation, name: second || null }
}

interface NeoccTable {
  updated: string | null
  rows: string[][]
}

/**
 * NEOCC's flat files are pipe-separated tables under a "Last Update:" line and three
 * header lines (titles, column names, and a format line of A/N/D/E/Y placeholders).
 */
function neoccTable(text: string, expectColumns: number): NeoccTable {
  const lines = text.split('\n')
  const updatedMatch = /^Last Update:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/.exec(lines[0] ?? '')
  const formatLine = lines.findIndex((l) => /^A{6,} A{6,}\s*\|/.test(l))
  if (!updatedMatch || formatLine < 0) throw new Error('not an ESA NEOCC table')
  const rows: string[][] = []
  for (const line of lines.slice(formatLine + 1)) {
    if (!line.includes('|')) continue
    const cells = line.split('|').map((c) => c.trim())
    if (cells.length >= expectColumns) rows.push(cells)
  }
  return { updated: isoMinutes(updatedMatch[1] ?? ''), rows }
}

/** One object on ESA's risk list: a non-zero chance of impact within 100 years. */
export interface NeoccRiskEntry extends NeoccObject {
  diameterM: number | null
  /** The diameter is estimated from H ("*" in the table). */
  diameterEstimated: boolean
  /** The date of the virtual impactor with the highest probability, ISO. */
  impactDate: string | null
  /** That impactor's probability, and its Palermo scale. */
  ipMax: number | null
  psMax: number | null
  /** Torino scale; null where NEOCC writes "n/a". */
  torino: number | null
  velocityKms: number | null
  /** The span of years with virtual impactors ("2027-2126"). */
  years: string
  /** Cumulative impact probability and Palermo scale over all of them. */
  ipCum: number | null
  psCum: number | null
}

export function parseNeoccRiskList(text: string): {
  updated: string | null
  entries: NeoccRiskEntry[]
} {
  const table = neoccTable(text, 11)
  const entries = table.rows.map((c) => ({
    ...neoccObject(c[0] ?? ''),
    diameterM: num(c[1]),
    diameterEstimated: (c[2] ?? '').includes('*'),
    impactDate: isoMinutes(c[3] ?? ''),
    ipMax: num(c[4]),
    psMax: num(c[5]),
    torino: num(c[6]),
    velocityKms: num(c[7]),
    years: c[8] ?? '',
    ipCum: num(c[9]),
    psCum: num(c[10]),
  }))
  return { updated: table.updated, entries }
}

/** One upcoming close approach in ESA's list (the next year, within about 0.05 au). */
export interface NeoccCloseApproach extends NeoccObject {
  /** Date of closest approach, YYYY-MM-DD. */
  date: string
  missKm: number | null
  missAu: number | null
  /** Miss distance in lunar distances. */
  missLd: number | null
  diameterM: number | null
  diameterEstimated: boolean
  h: number | null
  /** Brightest apparent magnitude around the approach. */
  maxBrightMag: number | null
  vRelKms: number | null
  /** NEOCC's close approach importance index. */
  caiIndex: number | null
}

export function parseNeoccCloseApproaches(text: string): {
  updated: string | null
  entries: NeoccCloseApproach[]
} {
  const table = neoccTable(text, 11)
  const entries = table.rows.map((c) => ({
    ...neoccObject(c[0] ?? ''),
    date: c[1] ?? '',
    missKm: num(c[2]),
    missAu: num(c[3]),
    missLd: num(c[4]),
    diameterM: num(c[5]),
    diameterEstimated: (c[6] ?? '').includes('*'),
    h: num(c[7]),
    maxBrightMag: num(c[8]),
    vRelKms: num(c[9]),
    caiIndex: num(c[10]),
  }))
  return { updated: table.updated, entries }
}
