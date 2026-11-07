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
