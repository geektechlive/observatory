/**
 * Observation times for the Sun view's SDO images (#73). SDO publishes one small times
 * file per channel ("0171: 20261025_164622"); the HMI file starts "Time 20261025_161500".
 * Shared by /api/sdo-times and the Sun stage.
 */

/** Wavelength keys the Sun stage shows, and the times file each one reads. */
export const SDO_TIME_FILES = {
  '0171': 'times0171.txt',
  '0193': 'times0193.txt',
  '0211': 'times0211.txt',
  '0304': 'times0304.txt',
  HMIB: 'hmitimes.txt',
} as const

export type SdoChannel = keyof typeof SDO_TIME_FILES
export type SdoTimes = Record<SdoChannel, string | null>

/** The composite blends three AIA channels; it is only as new as the oldest one. */
const COMPOSITE: Record<string, readonly SdoChannel[]> = {
  '211193171': ['0211', '0193', '0171'],
}

const STAMP = /(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/

/** The first YYYYMMDD_HHMMSS stamp in a times file, as ISO UTC; null if none is valid. */
export function sdoStamp(text: string): string | null {
  const m = STAMP.exec(text)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}Z`
  const date = new Date(iso)
  // Date rolls 2026-13-99 over into a real day instead of failing, so compare back.
  return !Number.isNaN(date.getTime()) && date.toISOString() === iso.replace('Z', '.000Z')
    ? iso
    : null
}

/** When the image for this wavelength key was observed, or null if unknown. */
export function observedAt(times: Partial<SdoTimes>, key: string): string | null {
  const channels = COMPOSITE[key] ?? (key in SDO_TIME_FILES ? [key as SdoChannel] : [])
  const stamps = channels.map((c) => times[c] ?? null)
  if (stamps.length === 0 || stamps.some((s) => s === null)) return null
  return (stamps as string[]).reduce((oldest, s) => (s < oldest ? s : oldest))
}

/** "16:46 UT". */
export function formatObserved(iso: string): string {
  return `${iso.slice(11, 16)} UT`
}
