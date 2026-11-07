// Parsers for JPL Horizons answers. The data rows live between $$SOE and $$EOE inside
// the JSON `result` string; everything around them is header text.
//
// Plain TypeScript with no imports and nothing but erasable syntax, so
// scripts/refresh-data.mjs can import it directly under Node's type stripping (#93).

/** The data rows between $$SOE and $$EOE, trimmed, blank lines dropped. */
export function horizonsRows(result: string): string[] {
  const soe = result.indexOf('$$SOE')
  const eoe = result.indexOf('$$EOE')
  if (soe < 0 || eoe < 0 || eoe < soe) return []
  return result
    .slice(soe + 5, eoe)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

// ---------------------------------------------------------------- OBSERVER tables
// With QUANTITIES='1,9,23' each row is:
//   DATE TIME  RA_h RA_m RA_s  Dec_d Dec_m Dec_s  APmag  S-brt  elong  /code

export interface HorizonsObservation {
  /** Right ascension, hours (0-24). */
  raHours: number
  /** Declination, degrees. */
  decDeg: number
  /** Apparent visual magnitude (NaN if n.a.). */
  mag: number
  /** Solar elongation, degrees. */
  elongation: number
}

export function parseHorizons(result: string): HorizonsObservation | null {
  const firstLine = horizonsRows(result)[0]
  if (!firstLine) return null

  const t = firstLine.split(/\s+/)
  // date, time, RA(3), Dec(3), APmag, S-brt, elong, code → at least 11 tokens
  if (t.length < 11) return null

  const raH = Number(t[2])
  const raM = Number(t[3])
  const raS = Number(t[4])
  if (![raH, raM, raS].every(Number.isFinite)) return null
  const raHours = raH + raM / 60 + raS / 3600

  const decRaw = t[5] ?? ''
  const decD = Number(decRaw)
  const decM = Number(t[6])
  const decS = Number(t[7])
  if (![decD, decM, decS].every(Number.isFinite)) return null
  const sign = decRaw.trim().startsWith('-') ? -1 : 1
  const decDeg = sign * (Math.abs(decD) + decM / 60 + decS / 3600)

  const mag = parseFloat(t[8] ?? '')
  const elongation = parseFloat(t[10] ?? '')

  return { raHours, decDeg, mag, elongation: Number.isFinite(elongation) ? elongation : 0 }
}

// ---------------------------------------------------------------- VECTORS tables
// With VEC_TABLE=2 and CSV_FORMAT=YES each row is:
//   JDTDB, Calendar date (TDB), X, Y, Z, VX, VY, VZ,

/** One state: Julian date (TDB), position (au) and velocity (au/day). */
export interface HorizonsSample {
  jd: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
}

export interface HorizonsVectors {
  /** The "Target body name" header, e.g. "Voyager 1 (spacecraft) (-31)". */
  target: string | null
  samples: HorizonsSample[]
}

export function parseHorizonsVectors(result: string): HorizonsVectors | null {
  const rows = horizonsRows(result)
  if (rows.length === 0) return null
  const samples: HorizonsSample[] = []
  for (const row of rows) {
    const cells = row.split(',').map((c) => c.trim())
    // jd, calendar, x, y, z, vx, vy, vz (and a trailing empty cell)
    const nums = [cells[0], cells[2], cells[3], cells[4], cells[5], cells[6], cells[7]].map((c) =>
      c === undefined || c === '' ? Number.NaN : Number(c),
    )
    if (!nums.every(Number.isFinite)) continue
    const [jd = 0, x = 0, y = 0, z = 0, vx = 0, vy = 0, vz = 0] = nums
    samples.push({ jd, x, y, z, vx, vy, vz })
  }
  const target = /^Target body name:\s*(.+?)\s*(?:\{|$)/m.exec(result)?.[1]?.trim() ?? null
  return { target, samples }
}

// ---------------------------------------------------------------- span and provenance

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

const monthIndex = (name: string) => MONTHS.indexOf(name.slice(0, 3).toUpperCase())

const isoDate = (year: number, month: number, day: number) =>
  `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

export interface EphemerisLimit {
  /** 'after': the ephemeris ends at `iso`. 'prior': it starts there. */
  side: 'after' | 'prior'
  /** The limit as an ISO timestamp (TDB read as UTC: 69 s apart, irrelevant to clamping). */
  iso: string
}

/**
 * Horizons refuses a request that runs past an object's ephemeris with
 *   No ephemeris for target "SOHO (spacecraft)" after A.D. 2026-DEC-14 23:51:09.1834 TDB
 * (or "prior to" at the start). The refresh job clamps its span to this and asks again.
 */
export function parseEphemerisLimit(result: string): EphemerisLimit | null {
  const m =
    /No ephemeris for target .*?\b(after|prior to) A\.D\. (\d{4})-([A-Za-z]{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/.exec(
      result,
    )
  if (!m) return null
  const [, side, y, mon, d, hh, mm, ss, frac = '0'] = m
  const month = monthIndex(mon ?? '')
  if (month < 0) return null
  const ms = Math.round(Number(`0.${frac}`) * 1000)
  const t = Date.UTC(Number(y), month, Number(d), Number(hh), Number(mm), Number(ss), ms)
  return { side: side === 'after' ? 'after' : 'prior', iso: new Date(t).toISOString() }
}

/**
 * Up to when the trajectory rests on tracking data; after it, a prediction (spec Part
 * 16). Horizons says so in free text, in several forms:
 *   "Based on tracking data through 2026-Nov-02, prediction thereafter."   (Wind)
 *   "based on tracking data through November 1, with prediction thereafter" (JWST)
 *   "1992-Apr-24  Final two-way tracking measurements"                      (Voyagers)
 *   "soho_2026  2026-Jan-01  2026-Dec-14 (prediction > Oct 05)"             (SOHO)
 * A month and day with no year takes the request's year, or the year before if that
 * would put it in the future. Null when the header says nothing (planets).
 */
export function parseObservedUntil(result: string, nowMs: number): string | null {
  const full = /tracking data through (\d{4})-([A-Za-z]{3})-(\d{2})/.exec(result)
  if (full) {
    const month = monthIndex(full[2] ?? '')
    if (month >= 0) return isoDate(Number(full[1]), month, Number(full[3]))
  }

  const noYear = /tracking data through ([A-Z][a-z]+) (\d{1,2})\b/.exec(result)
  if (noYear) {
    const month = monthIndex(noYear[1] ?? '')
    if (month >= 0) {
      const day = Number(noYear[2])
      let year = new Date(nowMs).getUTCFullYear()
      if (Date.UTC(year, month, day) > nowMs) year -= 1
      return isoDate(year, month, day)
    }
  }

  const voyager = /(\d{4})-([A-Za-z]{3})-(\d{2})\s+Final two-way tracking/.exec(result)
  if (voyager) {
    const month = monthIndex(voyager[2] ?? '')
    if (month >= 0) return isoDate(Number(voyager[1]), month, Number(voyager[3]))
  }

  // The last trajectory segment that says where its prediction starts.
  const segments = [
    ...result.matchAll(
      /(\d{4})-[A-Za-z]{3}-\d{2}\s+\d{4}-[A-Za-z]{3}-\d{2}\s+\(prediction > ([A-Za-z]{3}) (\d{1,2})\)/g,
    ),
  ]
  const last = segments.at(-1)
  if (last) {
    const month = monthIndex(last[2] ?? '')
    if (month >= 0) return isoDate(Number(last[1]), month, Number(last[3]))
  }
  return null
}

// ---------------------------------------------------------------- small-body headers

export interface SmallBodyHeader {
  /** Epoch of the osculating elements, Julian date (TDB). */
  epochJd: number
  /** Eccentricity, perihelion distance (au) and time (JD TDB). */
  e: number
  q: number
  tp: number
  /** Node, argument of perihelion and inclination, degrees, ecliptic J2000. */
  om: number
  w: number
  i: number
  /** A comet's total-magnitude law, T = M1 + 5 log Δ + k1 log r; null when not given. */
  m1: number | null
  k1: number | null
  /** An asteroid's absolute magnitude (1I/'Oumuamua is filed as one). */
  h: number | null
  /** "JPL#55": which orbit solution answered. */
  solutionRef: string | null
  /** When that solution was computed, and on how many observations. */
  solutionDate: string | null
  observations: number | null
  /** The span of observations the orbit is fitted to: outside it, it is extrapolated. */
  dataArc: { from: string; to: string } | null
}

/** A header number: "6.12", ".7079" and "8." are numbers; "n.a." and absent are null. */
function headerNumber(result: string, label: string): number | null {
  const m = new RegExp(`(?:^|\\s)${label}=\\s*(-?[\\d.]+(?:E[+-]?\\d+)?)`, 'm').exec(result)
  if (!m?.[1]) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/**
 * The observed span, as comets write it ("data arc: 2025-10-03 to 2026-10-16") or as
 * 1I's note does ("observed data arc from 2017 October 14 to 2018 January 2").
 */
function dataArc(result: string): { from: string; to: string } | null {
  const iso = /data arc: (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/.exec(result)
  if (iso?.[1] && iso[2]) return { from: iso[1], to: iso[2] }
  const prose =
    /data arc from\s+(\d{4}) ([A-Za-z]+) (\d{1,2})\s+to\s+(\d{4}) ([A-Za-z]+) (\d{1,2})/.exec(
      result,
    )
  if (!prose) return null
  const [, y1 = '', m1 = '', d1 = '', y2 = '', m2 = '', d2 = ''] = prose
  const a = monthIndex(m1)
  const b = monthIndex(m2)
  if (a < 0 || b < 0) return null
  return { from: isoDate(Number(y1), a, Number(d1)), to: isoDate(Number(y2), b, Number(d2)) }
}

/**
 * The osculating elements and provenance in a comet's or asteroid's Horizons header
 * (#99). Null when the answer has no elements: a planet, a craft or an error page.
 */
export function parseSmallBodyHeader(result: string): SmallBodyHeader | null {
  const epochJd = headerNumber(result, 'EPOCH')
  const e = headerNumber(result, 'EC')
  const q = headerNumber(result, 'QR')
  const tp = headerNumber(result, 'TP')
  const om = headerNumber(result, 'OM')
  const w = headerNumber(result, 'W')
  const i = headerNumber(result, 'IN')
  if (epochJd === null || e === null || q === null || tp === null) return null
  if (om === null || w === null || i === null) return null
  const soln = /Soln\.date:\s*(\d{4})-([A-Za-z]{3})-(\d{2})/.exec(result)
  const solnMonth = monthIndex(soln?.[2] ?? '')
  const obs = /# obs:\s*(\d+)/.exec(result)?.[1]
  return {
    epochJd,
    e,
    q,
    tp,
    om,
    w,
    i,
    m1: headerNumber(result, 'M1'),
    k1: headerNumber(result, 'k1'),
    h: headerNumber(result, 'H'),
    solutionRef: /soln ref\.=\s*([^,\s]+)/.exec(result)?.[1] ?? null,
    solutionDate:
      soln && solnMonth >= 0 ? isoDate(Number(soln[1]), solnMonth, Number(soln[3])) : null,
    observations: obs === undefined ? null : Number(obs),
    dataArc: dataArc(result),
  }
}
