import { z } from 'zod'

export const SatelliteTleSchema = z.object({
  name: z.string(),
  line1: z.string(),
  line2: z.string(),
})

export const SatellitesResponseSchema = z.object({
  satellites: z.array(SatelliteTleSchema),
  updatedAt: z.string(),
})

export type SatelliteTle = z.infer<typeof SatelliteTleSchema>
export type SatellitesResponse = z.infer<typeof SatellitesResponseSchema>
