/**
 * The dwarf planets in the orrery (#99 item 8), from /api/orrery-dwarfs, drawn by the
 * comets' layer as a third group.
 *
 * - The marker sits on the coarse Horizons span only (Catmull-Rom), hidden outside it,
 *   never extrapolated. Pluto's barycentre covers the whole clock; Ceres, Eris, Makemake
 *   and Haumea only JPL's 1600–2500.
 * - The line is the closed orbit from the SBDB elements in dwarfs.ts (conic.ts), drawn
 *   whenever the group is on, even where the marker is hidden.
 *
 * Client only: the refresh job never imports this, so it may import freely.
 */
import type { OrreryDwarf, OrreryDwarfs } from '@/schemas/orreryDwarfs'
import { SIM_MAX_MS, SIM_MIN_MS } from '@/store/orreryClock'

import { conicPath } from './conic'
import { dwarfBySpkid, type DwarfSpec } from './dwarfs'
import { stateAt, type TrackState } from './ephemeris'
import {
  type SmallBodyEntry,
  type SmallBodyGroup,
  smallBodyKey,
  type SmallBodyPath,
  smallBodyPath,
  smallBodyState,
} from './smallBodyView'

const DAY_MS = 86_400_000
const JD_UNIX_EPOCH = 2440587.5
/** The notice rounds a span's ends to this many years: Ceres's ends 2500, Eris's 2499. */
const NOTICE_ROUND_YEARS = 10

/** A dwarf planet to draw: its scene key (`sbc:<SPK-ID>`), label, payload entry and spec. */
export interface DwarfEntry {
  key: string
  label: string
  group: 'dwarfs'
  body: OrreryDwarf
  spec: DwarfSpec
}

/** Everything the small-body layer draws: comets, the interstellar objects, dwarf planets. */
export type OrreryEntry = SmallBodyEntry | DwarfEntry
export type OrreryEntryGroup = SmallBodyGroup | 'dwarfs'

/** The payload's dwarf planets this build knows, in its order (Pluto first). */
export function dwarfEntries(data: OrreryDwarfs | undefined): DwarfEntry[] {
  const out: DwarfEntry[] = []
  for (const body of data?.dwarfs ?? []) {
    const spec = dwarfBySpkid(body.spkid)
    if (!spec) continue
    out.push({ key: smallBodyKey(body.spkid), label: body.name, group: 'dwarfs', body, spec })
  }
  return out
}

/** Where it is at a Julian date (TDB), from its span only, or null. */
export function dwarfState(entry: DwarfEntry, jd: number): TrackState | null {
  return stateAt({ fine: null, coarse: entry.body.coarse }, jd)
}

/** Its orbit line: the two-body ellipse from its elements, closed. */
export function dwarfPath(entry: DwarfEntry): SmallBodyPath {
  const path = conicPath(entry.spec.elements, Number.POSITIVE_INFINITY)
  return {
    points: path.points.map(({ x, y, z }) => ({ x, y, z })),
    closed: path.closed,
    source: 'conic',
  }
}

/** Where any drawn small body is, from its samples only, or null. */
export function entryState(entry: OrreryEntry, jd: number): TrackState | null {
  return entry.group === 'dwarfs' ? dwarfState(entry, jd) : smallBodyState(entry.body, jd)
}

/** The line drawn for any small body. */
export function entryPath(entry: OrreryEntry): SmallBodyPath {
  return entry.group === 'dwarfs' ? dwarfPath(entry) : smallBodyPath(entry.body)
}

const msOfJd = (jd: number) => (jd - JD_UNIX_EPOCH) * DAY_MS

/** The first and last sample's dates, ms. */
function spanEnds(entry: DwarfEntry): { from: number; to: number } {
  const { start, step, samples } = entry.body.coarse
  const last = start + (Math.floor(samples.length / 3) - 1) * step
  return { from: msOfJd(start), to: msOfJd(last) }
}

/** A year rounded to decades, with BC for years before 1 AD (astronomical year 0 is 1 BC). */
function roundedYear(ms: number, era: boolean): string {
  const y = new Date(ms).getUTCFullYear()
  const round = (n: number) => Math.round(n / NOTICE_ROUND_YEARS) * NOTICE_ROUND_YEARS
  if (y < 1) return `${String(round(1 - y))} BC`
  return era ? `${String(round(y))} AD` : String(round(y))
}

/** The years a span covers, rounded to decades: "1600 to 2500". */
function spanYears(entry: DwarfEntry): string {
  const { from, to } = spanEnds(entry)
  const bc = new Date(from).getUTCFullYear() < 1
  return `${roundedYear(from, bc)} to ${roundedYear(to, bc)}`
}

/** spanYears, or "the whole clock, …" when the span covers every date the clock allows. */
function coverageText(entry: DwarfEntry): string {
  const { from, to } = spanEnds(entry)
  const whole = from <= SIM_MIN_MS && to >= SIM_MAX_MS
  return whole
    ? `the whole clock, ${roundedYear(SIM_MIN_MS, true)} to ${roundedYear(SIM_MAX_MS, true)}`
    : spanYears(entry)
}

const listed = (names: readonly string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}` : (names[0] ?? '')

/**
 * The stage's line for dwarf planets whose markers are hidden at this date, grouped by
 * the window their own spans cover. Null when every marker is drawn.
 */
export function dwarfNotice(entries: readonly OrreryEntry[], jd: number): string | null {
  const byWindow = new Map<string, string[]>()
  for (const e of entries) {
    if (e.group !== 'dwarfs' || dwarfState(e, jd) !== null) continue
    const window = spanYears(e)
    byWindow.set(window, [...(byWindow.get(window) ?? []), e.label])
  }
  if (byWindow.size === 0) return null
  return [...byWindow]
    .map(([window, names]) =>
      names.length === 1
        ? `${listed(names)} is hidden: JPL's ephemeris for it covers about ${window}. Its orbit is still drawn.`
        : `${listed(names)} are hidden: JPL's ephemerides for them cover about ${window}. Their orbits are still drawn.`,
    )
    .join(' ')
}

interface StatusInput {
  status: 'pending' | 'error' | 'success'
  /** The switch is on. */
  enabled: boolean
  count: number
}

/** The switch's status line: what is loaded, or why there is none. Empty while it is off. */
export function dwarfStatus({ status, enabled, count }: StatusInput): string {
  if (!enabled) return ''
  if (status === 'pending') return 'Loading from JPL Horizons…'
  // Before the refresh job first writes them the endpoint answers 503 (#99 item 8).
  if (status === 'error')
    return 'No dwarf-planet data yet, or JPL Horizons data is unreachable right now.'
  if (count === 0) return 'No dwarf-planet data yet: the next data refresh adds it.'
  return `${String(count)} dwarf ${count === 1 ? 'planet' : 'planets'}, from JPL Horizons`
}

export interface DwarfFactsData {
  /** Heliocentric distance now, au, or null where the span does not cover the date. */
  sunAu: number | null
  /** The years the span covers, as the notice gives them. */
  coverage: string
  /** Semi-major axis (au) and period (years) from the line's elements. */
  aAu: number
  periodYears: number
  e: number
  epochJd: number
  target: string
  barycentre: boolean
}

/** What the inspector may say about a dwarf planet at a sim time. */
export function dwarfFacts(entry: DwarfEntry, simMs: number): DwarfFactsData {
  const p = dwarfState(entry, simMs / DAY_MS + JD_UNIX_EPOCH)?.position
  const { e, q, epochJd } = entry.spec.elements
  const a = q / (1 - e)
  return {
    sunAu: p ? Math.hypot(p.x, p.y, p.z) : null,
    coverage: coverageText(entry),
    aAu: a,
    periodYears: a ** 1.5,
    e,
    epochJd,
    target: entry.body.target,
    barycentre: entry.spec.command === '9',
  }
}
