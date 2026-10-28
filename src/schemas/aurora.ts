import { z } from 'zod'

const line = z.array(z.tuple([z.number(), z.number()]))
const reach = z.object({ n: line, s: line })

export const AuroraSchema = z.object({
  /** [lon, lat, intensity] triplets for the predicted auroral oval. */
  points: z.array(z.tuple([z.number(), z.number(), z.number()])),
  /**
   * The oval's equatorward edge per longitude (#77), at 10% (likely) and 5% (possible)
   * overhead. Optional so an answer cached before #77 still parses.
   */
  reach: z.object({ likely: reach, possible: reach }).optional(),
  observationTime: z.string(),
  forecastTime: z.string(),
  updatedAt: z.string(),
})

export type Aurora = z.infer<typeof AuroraSchema>
