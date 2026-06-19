import { z } from 'zod'

export const AircraftSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  track: z.number(),
  altM: z.number().nullable(),
  callsign: z.string(),
})

export const AircraftResponseSchema = z.object({
  aircraft: z.array(AircraftSchema),
  updatedAt: z.string(),
})

export type Aircraft = z.infer<typeof AircraftSchema>
export type AircraftResponse = z.infer<typeof AircraftResponseSchema>
