// Parser for JPL Horizons OBSERVER tables. The data rows live between $$SOE and
// $$EOE inside the JSON `result` string. With QUANTITIES='1,9,23' each row is:
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
  const soe = result.indexOf('$$SOE')
  const eoe = result.indexOf('$$EOE')
  if (soe < 0 || eoe < 0) return null

  const block = result.slice(soe + 5, eoe).trim()
  const firstLine = block.split('\n')[0]?.trim()
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
