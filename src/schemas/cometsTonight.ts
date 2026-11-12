import { z } from 'zod'

import { SampledSpanSchema } from './orreryBodies'

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
})

export type TonightComet = z.infer<typeof TonightCometSchema>
export type CometsTonightData = z.infer<typeof CometsTonightSchema>
