import { z } from 'zod'

export const FireSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  /** Fire Radiative Power, MW (intensity proxy). */
  frp: z.number(),
  confidence: z.string(),
  acqDate: z.string(),
  daynight: z.string(),
})

export const FiresResponseSchema = z.object({
  fires: z.array(FireSchema),
  /** Total detections before the display cap. */
  total: z.number(),
  updatedAt: z.string(),
})

export type Fire = z.infer<typeof FireSchema>
export type FiresResponse = z.infer<typeof FiresResponseSchema>
