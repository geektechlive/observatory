import { z } from 'zod'

export const BuoySchema = z.object({
  station: z.string(),
  lat: z.number(),
  lon: z.number(),
  waterTemp: z.number().nullable(),
  waveHeight: z.number().nullable(),
  windSpeed: z.number().nullable(),
})

export const BuoysResponseSchema = z.object({
  buoys: z.array(BuoySchema),
  updatedAt: z.string(),
})

export type Buoy = z.infer<typeof BuoySchema>
export type BuoysResponse = z.infer<typeof BuoysResponseSchema>
