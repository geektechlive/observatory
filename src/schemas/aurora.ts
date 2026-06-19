import { z } from 'zod'

export const AuroraSchema = z.object({
  /** [lon, lat, intensity] triplets for the predicted auroral oval. */
  points: z.array(z.tuple([z.number(), z.number(), z.number()])),
  observationTime: z.string(),
  forecastTime: z.string(),
  updatedAt: z.string(),
})

export type Aurora = z.infer<typeof AuroraSchema>
