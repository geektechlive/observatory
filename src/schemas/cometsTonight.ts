import { z } from 'zod'

import { SampledSpanSchema } from './orreryBodies'
import { ConicElementsSchema } from './orrerySmallBodies'

/**
 * /api/comets-tonight (#135): the Tonight panel's slice of /api/orrery-smallbodies, cut by
 * scripts/comets-tonight.mjs in the refresh job and served straight from KV. Only the
 * comets and interstellar objects with a magnitude law, each with its spans cut to a day
 * before the refresh through a week after (`window`); same frame and units as the full
 * payload (heliocentric ecliptic J2000, au and au/day, TDB).
 */
export const TonightCometSchema = z.object({
  id: z.string(),
  name: z.string(),
  interstellar: z.boolean(),
  /** Total-magnitude law: T = M1 + 5 log Δ + K1 log r. */
  m1: z.number(),
  k1: z.number(),
  fine: SampledSpanSchema.nullable(),
  coarse: SampledSpanSchema.nullable(),
})

/**
 * A bright asteroid (#99 item 4): H and G for the magnitude law (G = 0.15 where JPL has
 * none, `gAssumed`), daily Horizons samples with velocities, and its elements for the
 * orrery's orbit line.
 */
export const TonightAsteroidSchema = z.object({
  id: z.string(),
  spkid: z.string(),
  name: z.string(),
  h: z.number(),
  g: z.number(),
  gAssumed: z.boolean(),
  elements: ConicElementsSchema,
  fine: SampledSpanSchema,
})

export const CometsTonightSchema = z.object({
  generatedAt: z.string(),
  frame: z.literal('ecliptic-J2000'),
  center: z.literal('Sun'),
  timeScale: z.literal('TDB'),
  provider: z.literal('jpl-horizons'),
  /** The Julian dates (TDB) the spans were cut to. */
  window: z.object({ fromJd: z.number(), toJd: z.number() }),
  /** Brightest-forecast comets first, then the interstellar objects. */
  comets: z.array(TonightCometSchema),
  /** Brightest-forecast first. Absent in a v1 body a browser may still hold: read as none. */
  asteroids: z.array(TonightAsteroidSchema).default([]),
})

export type TonightComet = z.infer<typeof TonightCometSchema>
export type TonightAsteroid = z.infer<typeof TonightAsteroidSchema>
export type CometsTonightData = z.infer<typeof CometsTonightSchema>
