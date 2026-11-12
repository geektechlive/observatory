/**
 * The dwarf planets in the orrery (#99 item 8), from /api/orrery-dwarfs, drawn by the
 * comets' layer as a third group.
 *
 * - The marker sits on the coarse Horizons span only (Catmull-Rom), hidden outside it,
 *   never extrapolated. Pluto's barycentre covers the whole clock; Ceres, Eris, Makemake
 *   and Haumea only JPL's 1600–2500.
 * - The line is the closed orbit from the SBDB elements in dwarfs.ts (conic.ts), drawn
 *   whenever the group is on, even where the marker is hidden.
 * - Charon (#99) is an entry of its own kind ('moon'): its fine span from the Pluto
 *   barycentre, drawn around Pluto's marker only with Pluto or Charon focused.
 *
 * Client only: the refresh job never imports this, so it may import freely.
 */
import type { OrreryDwarf, OrreryDwarfMoon, OrreryDwarfs } from '@/schemas/orreryDwarfs'
import { SIM_MAX_MS, SIM_MIN_MS } from '@/store/orreryClock'

import { conicPath } from './conic'
import { CHARON, CHARON_KEY, dwarfBySpkid, type DwarfMoonSpec, type DwarfSpec } from './dwarfs'
import { stateAt, type TrackState } from './ephemeris'
import {
  type SmallBodyEntry,
  type SmallBodyGroup,
  smallBodyKey,
  type SmallBodyPath,
  smallBodyPath,
  smallBodyState,
} from './smallBodyView'
import { AU_KM } from './units'

const DAY_MS = 86_400_000
const JD_UNIX_EPOCH = 2440587.5
/** The notice rounds a span's ends to this many years: Ceres's ends 2500, Eris's 2499. */
const NOTICE_ROUND_YEARS = 10

/** A dwarf planet to draw: its scene key (`sbc:<SPK-ID>`), label, payload entry and spec. */
export interface DwarfEntry {
  key: string
  label: string
  group: 'dwarfs'
  kind: 'planet'
  body: OrreryDwarf
  spec: DwarfSpec
}

/**
 * Charon (#99): in the dwarf group, under the same switch, placed around its planet as
 * drawn (the layer's placeMoons), never on its own heliocentric spot, which would sit
 * inside Pluto's marker at any zoom.
 */
export interface DwarfMoonEntry {
  key: string
  label: string
  group: 'dwarfs'
  kind: 'moon'
  moon: OrreryDwarfMoon
  spec: DwarfMoonSpec
  parent: DwarfEntry
}

/** Everything the small-body layer draws: comets, the interstellar objects, dwarf planets. */
export type OrreryEntry = SmallBodyEntry | DwarfEntry | DwarfMoonEntry
export type OrreryEntryGroup = SmallBodyGroup | 'dwarfs'

/** Charon, as opposed to anything drawn on its own heliocentric position. */
export const isDwarfMoon = (e: OrreryEntry): e is DwarfMoonEntry =>
  e.group === 'dwarfs' && e.kind === 'moon'

/** The payload's dwarf planets this build knows, in its order (Pluto first), then Charon. */
export function dwarfEntries(data: OrreryDwarfs | undefined): (DwarfEntry | DwarfMoonEntry)[] {
  const out: DwarfEntry[] = []
  for (const body of data?.dwarfs ?? []) {
    const spec = dwarfBySpkid(body.spkid)
    if (!spec) continue
    out.push({
      key: smallBodyKey(body.spkid),
      label: body.name,
      group: 'dwarfs',
      kind: 'planet',
      body,
      spec,
    })
  }
  const moon = data?.charon
  const parent = moon ? out.find((d) => d.body.spkid === moon.parentSpkid) : undefined
  if (!moon || !parent || moon.naifId !== CHARON.naifId) return out
  return [
    ...out,
    {
      key: CHARON_KEY,
      label: moon.name,
      group: 'dwarfs',
      kind: 'moon',
      moon,
      spec: CHARON,
      parent,
    },
  ]
}

/** Charon's vector from the Pluto barycentre (au, au/day), from its samples only, or null. */
export function dwarfMoonRelative(entry: DwarfMoonEntry, jd: number): TrackState | null {
  return stateAt({ fine: entry.moon.fine, coarse: null }, jd)
}

/** Charon's heliocentric state: Pluto's barycentre plus its own vector, or null. */
export function dwarfMoonState(entry: DwarfMoonEntry, jd: number): TrackState | null {
  const rel = dwarfMoonRelative(entry, jd)
  const bary = rel ? dwarfState(entry.parent, jd) : null
  if (!rel || !bary) return null
  const add = (a: TrackState['position'], b: TrackState['position']) => ({
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
  })
  return {
    position: add(bary.position, rel.position),
    velocity: add(bary.velocity, rel.velocity),
    resolution: 'fine',
  }
}

/**
 * Whether Charon is drawn (its switch on and a sample covering the date aside): only
 * with Pluto or Charon focused. It is drawn to Pluto's own scale around Pluto's marker,
 * 15 of Pluto's radii out, which would crowd any wider view of the outer system.
 */
export function dwarfMoonShown(entry: DwarfMoonEntry, focus: string | null): boolean {
  return focus === entry.key || focus === entry.parent.key
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
  if (entry.group !== 'dwarfs') return smallBodyState(entry.body, jd)
  return entry.kind === 'moon' ? dwarfMoonState(entry, jd) : dwarfState(entry, jd)
}

/** Charon draws no line of its own. */
const NO_PATH: SmallBodyPath = { points: [], closed: false, source: 'horizons' }

/** The line drawn for any small body. */
export function entryPath(entry: OrreryEntry): SmallBodyPath {
  if (entry.group !== 'dwarfs') return smallBodyPath(entry.body)
  return entry.kind === 'moon' ? NO_PATH : dwarfPath(entry)
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
export function dwarfNotice(
  entries: readonly OrreryEntry[],
  jd: number,
  /** The chosen object: Charon is named only when it would show (dwarfMoonShown). */
  focus: string | null = null,
): string | null {
  const byWindow = new Map<string, string[]>()
  const moons: string[] = []
  for (const e of entries) {
    if (e.group !== 'dwarfs') continue
    if (e.kind === 'moon') {
      if (dwarfMoonShown(e, focus) && dwarfMoonRelative(e, jd) === null) {
        moons.push(dwarfMoonNotice(e))
      }
      continue
    }
    if (dwarfState(e, jd) !== null) continue
    const window = spanYears(e)
    byWindow.set(window, [...(byWindow.get(window) ?? []), e.label])
  }
  if (byWindow.size === 0 && moons.length === 0) return null
  return [
    ...[...byWindow].map(([window, names]) =>
      names.length === 1
        ? `${listed(names)} is hidden: JPL's ephemeris for it covers about ${window}. Its orbit is still drawn.`
        : `${listed(names)} are hidden: JPL's ephemerides for them cover about ${window}. Their orbits are still drawn.`,
    ),
    ...moons,
  ].join(' ')
}

const isoDay = (jd: number) => new Date(msOfJd(jd)).toISOString().slice(0, 10)
const yearOf = (iso: string) => iso.slice(0, 4)

/** The days Charon's samples cover: "2026-10-28 to 2026-11-27". */
function moonSampleDays(entry: DwarfMoonEntry): string {
  const { start, step, samples } = entry.moon.fine
  const last = start + (Math.floor(samples.length / 6) - 1) * step
  return `${isoDay(start)} to ${isoDay(last)}`
}

/** JPL's own window for Charon, in years: "1800 to 2199". */
const moonEphemerisYears = (entry: DwarfMoonEntry) =>
  `${yearOf(entry.spec.ephemerisFrom)} to ${yearOf(entry.spec.ephemerisTo)}`

function dwarfMoonNotice(entry: DwarfMoonEntry): string {
  return `${entry.label} is hidden: the site carries its samples for ${moonSampleDays(entry)}, around the last data refresh (JPL's ephemeris for it covers ${moonEphemerisYears(entry)}).`
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

export interface DwarfMoonFactsData {
  /** Distance from the Pluto barycentre now, km, or null outside the samples. */
  fromBarycentreKm: number | null
  /** The days the site's samples cover. */
  samples: string
  /** JPL's own window for it, in years. */
  ephemeris: string
  periodDays: number
  semiMajorAxisKm: number
  radiusKm: number
  target: string
  center: string
}

/** What the inspector may say about Charon at a sim time. */
export function dwarfMoonFacts(entry: DwarfMoonEntry, simMs: number): DwarfMoonFactsData {
  const p = dwarfMoonRelative(entry, simMs / DAY_MS + JD_UNIX_EPOCH)?.position
  return {
    fromBarycentreKm: p ? Math.hypot(p.x, p.y, p.z) * AU_KM : null,
    samples: moonSampleDays(entry),
    ephemeris: moonEphemerisYears(entry),
    periodDays: entry.spec.periodDays,
    semiMajorAxisKm: entry.spec.semiMajorAxisKm,
    radiusKm: entry.spec.radiusKm,
    target: entry.moon.target,
    center: entry.moon.center,
  }
}
