/**
 * Dates for the orrery's time bar (#91). JavaScript's Date covers ±271,821 years, so
 * 3000 BC is no problem; the text form uses astronomical years (1 BC = year 0, 3000 BC
 * = -2999) so the date field can reach Table 2's whole window.
 */

export const DAY_MS = 86_400_000
/** Table 2's window as dates (proleptic Gregorian), matching VALID_T2_* in elements.ts. */
export const MIN_YEAR = -2999
export const MAX_YEAR = 3000

const pad = (n: number, width: number) => String(Math.abs(n)).padStart(width, '0')

/** "2026-11-06 14:05 UTC", "-2999-01-01 00:00 UTC". */
export function formatSimUtc(ms: number): string {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const year = y < 0 ? `-${pad(y, 4)}` : pad(y, 4)
  return `${year}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)} ${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)} UTC`
}

/** "YYYY-MM-DD" (year may be negative), in UTC midnight ms, or null if invalid or out of range. */
export function parseSimDate(text: string): number | null {
  const m = /^\s*(-?\d{1,4})-(\d{1,2})-(\d{1,2})\s*$/.exec(text)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }
  const d = new Date(0)
  d.setUTCFullYear(year, month - 1, day)
  d.setUTCHours(0, 0, 0, 0)
  // Rejects 31 Feb and friends, which Date would roll over.
  if (d.getUTCMonth() !== month - 1) return null
  return d.getTime()
}

/** The time bar's scrubber spans a year either side of its centre, in days. */
export const SCRUB_DAYS = 365

/**
 * The scrubber's centre: today, until the clock leaves its ±1-year window (a typed date,
 * or a year a second for a few seconds, #114); then the window moves to the clock, so
 * the thumb is never stuck at an end.
 */
export function scrubCentre(centre: number, sim: number): number {
  return Math.abs(sim - centre) > SCRUB_DAYS * DAY_MS ? sim : centre
}

/** The date-field form of a moment. */
export function toDateField(ms: number): string {
  return formatSimUtc(ms).slice(0, -10)
}
