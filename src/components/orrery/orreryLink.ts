/**
 * The orrery's shareable link (#108): `#orrery?t=<ISO UTC>&focus=<id>&preset=<id>`.
 *
 * - `t` is the simulated time, written to the second; a bare date means midnight UTC.
 *   It is clamped to the planet tables' range. A link with `t` opens paused there.
 * - `focus` is a catalog key: `Sun` and the planets by name, craft, Earth's Moon and the
 *   other moons as `naif:<id>` (NAIF ids, which never change), close-approach asteroids
 *   as `sb:<number or designation>`, and `L1`. On reading, a name works too, ignoring
 *   case, with `-` or `_` for spaces (`focus=voyager-1`).
 * - `preset` is one of the View buttons. With a focus too, the camera is on the preset
 *   and the inspector is open on the focus (choosing a preset keeps the selection).
 *
 * Kept apart from the three.js layer, like defaultView.ts, so it costs the page nothing.
 */
import { type ClockAnchor, SIM_MAX_MS, SIM_MIN_MS, simTimeAt } from '@/store/orreryClock'

import type { FocusPreset } from './three/framing'

export interface OrreryLink {
  t: number | null
  focus: string | null
  preset: FocusPreset | null
}

/** Every preset, as a record so a new one in `FocusPreset` fails the type check here. */
const PRESETS: Record<FocusPreset, true> = {
  sun: true,
  inner: true,
  outer: true,
  heliosphere: true,
  earth: true,
  orbit: true,
}

const isPreset = (s: string): s is FocusPreset => Object.hasOwn(PRESETS, s)

/** Longer than any catalog key or name; anything past it is not one. */
const MAX_FOCUS = 80
/** An ISO date, optionally with a time: `2012-08-25`, `-002999-01-01T00:00:00Z`. */
const ISO = /^[+-]?\d{4,6}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?)?$/

function decode(s: string): string | null {
  try {
    return decodeURIComponent(s)
  } catch {
    return null
  }
}

function parseTime(raw: string): number | null {
  if (!ISO.test(raw)) return null
  // A bare date or a time without a zone is UTC, whatever the browser's zone.
  const iso = raw.includes('T') ? (raw.endsWith('Z') ? raw : `${raw}Z`) : `${raw}T00:00:00Z`
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? Math.min(SIM_MAX_MS, Math.max(SIM_MIN_MS, ms)) : null
}

/** The link's values; null for each one that is missing or not understood. */
export function parseOrreryLink(hash: string): OrreryLink {
  const out: OrreryLink = { t: null, focus: null, preset: null }
  const raw = hash.replace(/^#\/?/, '')
  const [view = '', query] = raw.split('?')
  if (view.toLowerCase() !== 'orrery' || query === undefined) return out
  for (const part of query.split('&')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const key = part.slice(0, eq)
    // A hand-typed `Voyager+1` means a space; a year's sign (`+009000`) is kept.
    const rawValue = part.slice(eq + 1)
    const value = decode(key === 'focus' ? rawValue.replaceAll('+', ' ') : rawValue)?.trim()
    if (!value) continue
    if (key === 't') out.t = parseTime(value)
    else if (key === 'focus' && value.length <= MAX_FOCUS) out.focus = value
    else if (key === 'preset' && isPreset(value)) out.preset = value
  }
  return out
}

/** The colon stays readable (`naif:-31`); everything else is encoded. */
const encode = (s: string) => encodeURIComponent(s).replaceAll('%3A', ':')

function isoSeconds(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z')
}

export function serialiseOrreryLink(link: OrreryLink): string {
  const parts: string[] = []
  if (link.t !== null) parts.push(`t=${isoSeconds(link.t)}`)
  if (link.focus !== null) parts.push(`focus=${encode(link.focus)}`)
  if (link.preset !== null) parts.push(`preset=${link.preset}`)
  return parts.length > 0 ? `#orrery?${parts.join('&')}` : '#orrery'
}

const loose = (s: string) => s.toLowerCase().replace(/[-_\s]+/g, ' ')

/** The catalog key a link's focus names: its key, else its name. */
export function resolveFocus(
  focus: string,
  items: readonly { key: string; label: string }[],
): string | null {
  const exact = items.find((i) => i.key === focus)
  if (exact) return exact.key
  const want = loose(focus)
  return items.find((i) => loose(i.label) === want || loose(i.key) === want)?.key ?? null
}

/** How far the clock may be from now and still be "now": a link to it carries no `t`. */
const LIVE_SLACK_MS = 60_000

/** The clock is running at real time on the wall clock, so a link needs no time. */
export function clockIsLive(c: ClockAnchor, wallNow: number): boolean {
  return c.playing && c.rate === 1 && Math.abs(simTimeAt(c, wallNow) - wallNow) <= LIVE_SLACK_MS
}
