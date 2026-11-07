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
