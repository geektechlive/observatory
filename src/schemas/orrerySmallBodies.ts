import { z } from 'zod'

import { SampledSpanSchema } from './orreryBodies'

/**
 * /api/orrery-smallbodies (#99): the comets JPL forecasts brightest tonight, and the
 * three interstellar objects, built by scripts/orrery-smallbodies.mjs in the refresh
 * job and served straight from KV, like /api/orrery-bodies.
 *
 * Vectors are Horizons' (heliocentric ecliptic J2000, au and au/day, TDB). `fine` is
 * now ±30 days daily with velocity, [x, y, z, vx, vy, vz] per sample; `coarse` (the
 * interstellar objects only) runs from three years before perihelion to five years
 * ahead, positions only. Outside both, a reader draws from `elements` with
 * src/lib/orrery/conic.ts and says it is a two-body estimate.
 */
export const ConicElementsSchema = z.object({
  /** Osculating at this epoch, Julian date (TDB). */
  epochJd: z.number().nullable(),
  e: z.number(),
  /** Perihelion distance, au, and time, JD (TDB). */
  q: z.number(),
  tp: z.number(),
  /** Node, argument of perihelion and inclination, degrees. */
  om: z.number(),
  w: z.number(),
  i: z.number(),
})

export const SmallBodySolutionSchema = z.object({
  /** "JPL#55": the orbit solution that answered. */
  ref: z.string().nullable(),
  /** When it was computed (YYYY-MM-DD), and on how many observations. */
  date: z.string().nullable(),
  observations: z.number().nullable(),
  /** The observed span (YYYY-MM-DD): inside it the path is fitted, outside extrapolated. */
  dataArc: z.object({ from: z.string(), to: z.string() }).nullable(),
})

export const OrrerySmallBodySchema = z.object({
  /** Namespaced by SPK-ID: `sb:1004083`. */
  id: z.string(),
  spkid: z.string(),
  /** JPL's designation ("C/2025 N1", "24P") and the name to show ("3I/ATLAS"). */
  des: z.string(),
  name: z.string(),
  /** How SBDB files it: 1I is an asteroid, every other entry a comet. */
  kind: z.enum(['comet', 'asteroid']),
  interstellar: z.boolean(),
  /** Discovery date (YYYY-MM-DD), interstellar objects only. */
  discovered: z.string().nullable(),
  /** JPL's total-magnitude forecast for the refresh's date, comets only: a forecast, not a measurement. */
  magnitude: z.number().nullable(),
  /** Total-magnitude law (T = M1 + 5 log Δ + k1 log r), or an asteroid's H. */
  m1: z.number().nullable(),
  k1: z.number().nullable(),
  h: z.number().nullable(),
  /** From Horizons' header when it answered, else SBDB's (`elementsSource`). */
  elements: ConicElementsSchema,
  elementsSource: z.enum(['horizons', 'sbdb']),
  /** The speed it keeps far from the Sun, km/s; null for a bound orbit. */
  vInfKms: z.number().nullable(),
  solution: SmallBodySolutionSchema.nullable(),
  /** Horizons' own "Target body name", checked against `des`. */
  target: z.string().nullable(),
  /** Where Horizons' ephemeris ends, when a span ran into it (ISO). */
  availableFrom: z.string().nullable(),
  availableTo: z.string().nullable(),
  fine: SampledSpanSchema.nullable(),
  coarse: SampledSpanSchema.nullable(),
})

export const OrrerySmallBodiesSchema = z.object({
  generatedAt: z.string(),
  /** When the interstellar objects' long spans were fetched; reused for a day. */
  coarseFetchedAt: z.string(),
  frame: z.literal('ecliptic-J2000'),
  center: z.literal('Sun'),
  timeScale: z.literal('TDB'),
  units: z.object({ position: z.literal('au'), velocity: z.literal('au/day') }),
  sourceType: z.literal('ephemeris'),
  provider: z.literal('jpl-horizons'),
  /** Brightest first. */
  comets: z.array(OrrerySmallBodySchema),
  /** 1I, 2I and 3I, in that order. */
  interstellar: z.array(OrrerySmallBodySchema),
  /** Sources or objects the last refresh could not fetch, and why. */
  missing: z.array(z.object({ id: z.string(), reason: z.string() })),
})

export type ConicElementsData = z.infer<typeof ConicElementsSchema>
export type OrrerySmallBody = z.infer<typeof OrrerySmallBodySchema>
export type OrrerySmallBodies = z.infer<typeof OrrerySmallBodiesSchema>
