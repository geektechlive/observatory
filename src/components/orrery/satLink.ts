/**
 * A satellite in the shareable link (#158): `focus=sat:<NORAD id>`. The format is the
 * satellite's scene key (satView.ts), so choosing one already writes it. Reading it needs
 * the satellite's group loaded, which needs the Earth orbit view open: the link hook asks
 * for that, then follows `satLinkStep`.
 */
import { SAT_KEY_PREFIX } from '@/lib/orrery/satView'

/** NORAD ids are digits, and six of them since 2026-07. */
const SAT_FOCUS = new RegExp(`^${SAT_KEY_PREFIX}(\\d{1,9})$`)

/** The NORAD id a link's focus names, or null when it names something else. */
export function satIdFromFocus(focus: string): string | null {
  return SAT_FOCUS.exec(focus)?.[1] ?? null
}

export type SatLinkStep = 'select' | 'wait' | 'widen' | 'drop'

/**
 * What a link to a satellite does next.
 * - `found`: the satellite is in a loaded group.
 * - `settled`: every switched-on group has loaded or failed.
 * - `allOn`: every group is switched on (the debris and Starlink start off).
 * Not found among the groups loaded: switch the rest on once (`widen`), then drop the
 * focus when they have settled too, the way any unknown focus is dropped.
 */
export function satLinkStep(s: { found: boolean; settled: boolean; allOn: boolean }): SatLinkStep {
  if (s.found) return 'select'
  if (!s.settled) return 'wait'
  return s.allOn ? 'drop' : 'widen'
}
