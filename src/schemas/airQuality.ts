import { z } from 'zod'

export const AirStationSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  /** PM2.5, µg/m³. */
  pm25: z.number(),
})

export const AirQualityResponseSchema = z.object({
  stations: z.array(AirStationSchema),
  updatedAt: z.string(),
})

export type AirStation = z.infer<typeof AirStationSchema>
export type AirQualityResponse = z.infer<typeof AirQualityResponseSchema>
