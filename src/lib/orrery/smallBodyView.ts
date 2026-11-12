/**
 * Comets and the interstellar objects in the orrery (#99), from /api/orrery-smallbodies.
 *
 * - The marker sits on Horizons' samples: the fine span, then (1I, 2I and 3I only) the
 *   coarse span. Outside both it is hidden. A position is never extrapolated.
 * - The line: an interstellar object's coarse Horizons positions; a comet, which has only
 *   ±30 days of samples, gets its orbit drawn from its elements (conic.ts), as a line only.
 * - The inspector shows what the payload carries and nothing computed in its place.
 *
 * Client only: the refresh job never imports this, so it may import freely.
 */
import type { OrrerySmallBodies, OrrerySmallBody } from '@/schemas/orrerySmallBodies'

import { conicPath } from './conic'
import { stateAt, type TrackState, trajectoryPoints } from './ephemeris'
import { lookupSpkid } from './lookupTrack'
import type { Vec3 } from './scale'

const JD_UNIX_EPOCH = 2440587.5
const DAY_MS = 86_400_000
/** A comet's line runs out to at least this far from the Sun, au. */
const PATH_MIN_CUT_AU = 8
/** ...and to this multiple of its perihelion distance... */
const PATH_PERIHELION_MULT = 2
/** ...and this far past the farthest point its samples reach. */
const PATH_SAMPLE_MARGIN = 1.25

export type SmallBodyGroup = 'comets' | 'interstellar'

/** A small body to draw: its scene key, label and group, with its payload entry. */
export interface SmallBodyEntry {
  key: string
  label: string
  group: SmallBodyGroup
  body: OrrerySmallBody
}

/**
 * The scene, search and link key: `sbc:<SPK-ID>`. Not the payload's `sb:` id, because the
 * close approaches are keyed `sb:<designation or number>` (scripts/orrery-neo.mjs) and the
 * renderer looks those up first, so a clash would hide the comet. Its own prefix also
 * lets a link tell, from the key alone, that it needs this payload.
 */
const KEY_PREFIX = 'sbc:'
const SPKID = /^\d{1,12}$/

export const smallBodyKey = (spkid: string) => `${KEY_PREFIX}${spkid}`

export function isSmallBodyKey(key: string): boolean {
  return key.startsWith(KEY_PREFIX) && SPKID.test(key.slice(KEY_PREFIX.length))
}

/**
 * The payload key for the same object as a JPL lookup (`lookup:50788063` →
 * `sbc:50788063`), so the renderer can draw it once. Null for any other key.
 */
export function lookupTwinKey(key: string): string | null {
  const spkid = lookupSpkid(key)
  return spkid === null ? null : smallBodyKey(spkid)
}

/** Every entry in the payload, comets then the interstellar objects. */
export function smallBodyEntries(data: OrrerySmallBodies | undefined): SmallBodyEntry[] {
  if (!data) return []
  const entry = (group: SmallBodyGroup) => (body: OrrerySmallBody) => ({
    key: smallBodyKey(body.spkid),
    label: body.name,
    group,
    body,
  })
  return [...data.comets.map(entry('comets')), ...data.interstellar.map(entry('interstellar'))]
}

interface StatusInput {
  status: 'pending' | 'error' | 'success'
  /** The data has been asked for (a switch is on, or a link wants one). */
  enabled: boolean
  comets: number
  interstellar: number
}

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`

/** The switch group's status line: what is loaded, or why there is none. Empty before it is asked for. */
export function smallBodyStatus({ status, enabled, comets, interstellar }: StatusInput): string {
  if (!enabled) return ''
  if (status === 'pending') return 'Loading from JPL Horizons…'
  if (status === 'error') return 'Comet data is not available right now.'
  return `${plural(comets, 'comet', 'comets')} and ${plural(interstellar, 'interstellar object', 'interstellar objects')}, from JPL Horizons`
}

/** Where it is at a Julian date (TDB), from its samples only, or null. */
export function smallBodyState(body: OrrerySmallBody, jd: number): TrackState | null {
  return stateAt({ fine: body.fine, coarse: body.coarse }, jd)
}

/** How far out a comet's orbit line is drawn, au. */
export function pathCutAu(body: OrrerySmallBody): number {
  let farthest = 0
  const samples = body.fine?.samples ?? []
  for (let i = 0; i + 2 < samples.length; i += 6) {
    farthest = Math.max(
      farthest,
      Math.hypot(samples[i] ?? 0, samples[i + 1] ?? 0, samples[i + 2] ?? 0),
    )
  }
  return Math.max(
    PATH_MIN_CUT_AU,
    PATH_PERIHELION_MULT * body.elements.q,
    farthest * PATH_SAMPLE_MARGIN,
  )
}

export interface SmallBodyPath {
  points: Vec3[]
  closed: boolean
  /** 'horizons': sampled positions. 'conic': a two-body orbit from the elements. */
  source: 'horizons' | 'conic'
}

/** The line drawn for it, heliocentric ecliptic au. */
export function smallBodyPath(body: OrrerySmallBody): SmallBodyPath {
  if (body.coarse) {
    const points = trajectoryPoints({ coarse: body.coarse }).map(({ x, y, z }) => ({ x, y, z }))
    return { points, closed: false, source: 'horizons' }
  }
  const path = conicPath(body.elements, pathCutAu(body))
  return {
    points: path.points.map(({ x, y, z }) => ({ x, y, z })),
    closed: path.closed,
    source: 'conic',
  }
}

/**
 * Whether the orbit solution rests on observations at this date: inside its data arc
 * (whole UTC days, both ends included) it is fitted to them, outside it extrapolated.
 * Null when the payload has no arc.
 */
export function solutionAt(
  solution: OrrerySmallBody['solution'],
  simMs: number,
): 'observed' | 'extrapolated' | null {
  const arc = solution?.dataArc
  if (!arc) return null
  const from = Date.parse(`${arc.from}T00:00:00Z`)
  const to = Date.parse(`${arc.to}T00:00:00Z`) + DAY_MS
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return simMs >= from && simMs < to ? 'observed' : 'extrapolated'
}

export interface SmallBodyFacts {
  kindLabel: 'Interstellar object' | 'Comet' | 'Asteroid'
  /** Interstellar only: the payload gives it a v∞, so it is not bound to the Sun. */
  hyperbolic: boolean
  /** Osculating, at the elements' epoch. */
  e: number
  q: number
  epochJd: number | null
  vInfKms: number | null
  discovered: string | null
  /** JPL's total-magnitude forecast for the refresh's date (not the sim date). */
  magnitude: number | null
  solution: OrrerySmallBody['solution']
  solutionAtDate: 'observed' | 'extrapolated' | null
  /** Which Horizons span places it at this date, or null when none does. */
  span: 'fine' | 'coarse' | null
  sunAu: number | null
  position: Vec3 | null
}

/** What the inspector may say about it at a sim time. */
export function smallBodyFacts(body: OrrerySmallBody, simMs: number): SmallBodyFacts {
  const state = smallBodyState(body, simMs / DAY_MS + JD_UNIX_EPOCH)
  const p = state?.position ?? null
  return {
    kindLabel: body.interstellar
      ? 'Interstellar object'
      : body.kind === 'comet'
        ? 'Comet'
        : 'Asteroid',
    hyperbolic: body.interstellar && body.vInfKms !== null,
    e: body.elements.e,
    q: body.elements.q,
    epochJd: body.elements.epochJd,
    vInfKms: body.interstellar ? body.vInfKms : null,
    discovered: body.discovered,
    magnitude: body.magnitude,
    solution: body.solution,
    solutionAtDate: solutionAt(body.solution, simMs),
    span: state?.resolution ?? null,
    sunAu: p ? Math.hypot(p.x, p.y, p.z) : null,
    position: p,
  }
}
