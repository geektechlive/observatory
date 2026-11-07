/**
 * Space-Track and DISCOS data in plain words (#101): re-entry times, the Box Score, an
 * object's type and radar size, a spacecraft's dimensions. Shared by the satellite
 * inspector, the Earth orbit controls and the ticker.
 */
import type { TickerItem } from '@/hooks/useTicker'
import type { Reentry } from '@/schemas/spaceTrack'

const DAY_MS = 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** Below this, a window reads better in minutes. */
const MINUTES_UNDER = 120

const two = (n: number) => String(n).padStart(2, '0')

/** "11 Nov 20:32 UTC". */
function utcText(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getUTCDate())} ${MONTHS[d.getUTCMonth()] ?? ''} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())} UTC`
}

/**
 * When a TIP message says an object comes down, and how sure: its WINDOW, which TIP
 * gives in minutes either side of the time.
 */
export function reentryWhen(r: Reentry): string {
  const window =
    r.windowMin < MINUTES_UNDER
      ? `${String(Math.round(r.windowMin))} min`
      : `${String(Math.round(r.windowMin / 60))} h`
  return `${utcText(r.decayEpoch)}, give or take ${window}`
}

/** Predictions still ahead of `nowMs`, within `days`, soonest first. */
export function reentriesWithin(list: readonly Reentry[], nowMs: number, days: number): Reentry[] {
  return list
    .filter((r) => {
      const at = Date.parse(r.decayEpoch)
      return at >= nowMs && at <= nowMs + days * DAY_MS
    })
    .sort((a, b) => a.decayEpoch.localeCompare(b.decayEpoch))
}

/** The ticker's re-entry lines: this week's predictions, named where known. */
export function reentryTickerItems(
  tip: { reentries: readonly Reentry[]; names: Readonly<Record<string, string>> },
  nowMs: number,
): TickerItem[] {
  return reentriesWithin(tip.reentries, nowMs, 7).map((r) => ({
    id: `reentry-${r.noradId}`,
    type: 'reentry',
    label: 'RE-ENTRY',
    description: `${tip.names[r.noradId] ?? `NORAD ${r.noradId}`} · ${reentryWhen(r)}`,
    color: 'var(--amber)',
    time: new Date(r.decayEpoch),
  }))
}

const count = (n: number) => n.toLocaleString('en-US')

/** The Box Score as one sentence. */
export function boxscoreLine(b: {
  inOrbit: { payload: number; rocketBody: number; debris: number; total: number }
}): string {
  const o = b.inOrbit
  return (
    `Space-Track tracks ${count(o.total)} objects in orbit: ${count(o.payload)} satellites, ` +
    `${count(o.rocketBody)} rocket bodies and ${count(o.debris)} pieces of debris.`
  )
}

const TYPES: Readonly<Record<string, string>> = {
  PAYLOAD: 'Satellite or spacecraft',
  'ROCKET BODY': 'Rocket stage',
  DEBRIS: 'Debris',
  TBA: 'Not yet identified',
  UNKNOWN: 'Unknown',
}

/** SATCAT's OBJECT_TYPE in plain words. */
export function objectTypeText(type: string): string {
  return TYPES[type.toUpperCase()] ?? type
}

/**
 * SATCAT's RCS_SIZE, a scaled radar cross-section. Space-Track's documentation: "RCS_SIZE
 * has 3 values: Small (< 0.1m), Medium (0.1m – 1m), & Large (>1m)".
 */
export function rcsText(size: string): string | null {
  switch (size.toUpperCase()) {
    case 'SMALL':
      return 'Small on radar (under 0.1 m)'
    case 'MEDIUM':
      return 'Medium on radar (0.1 to 1 m)'
    case 'LARGE':
      return 'Large on radar (over 1 m)'
    default:
      return null
  }
}

const m = (v: number) => String(Math.round(v * 10) / 10)

/** DISCOS dimensions as the parts it has: a box, or a cylinder, and its span. */
export function discosSize(o: {
  widthM: number | null
  heightM: number | null
  depthM: number | null
  diameterM: number | null
  spanM: number | null
}): string | null {
  const parts: string[] = []
  if (o.widthM !== null && o.heightM !== null && o.depthM !== null) {
    parts.push(`${m(o.widthM)} × ${m(o.heightM)} × ${m(o.depthM)} m`)
  } else {
    if (o.diameterM !== null) parts.push(`${m(o.diameterM)} m wide`)
    if (o.heightM !== null) parts.push(`${m(o.heightM)} m tall`)
  }
  if (o.spanM !== null) parts.push(`${m(o.spanM)} m across`)
  return parts.length > 0 ? parts.join(', ') : null
}
