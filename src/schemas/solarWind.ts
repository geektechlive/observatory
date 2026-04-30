import { z } from 'zod'

export const SolarWindSchema = z.object({
  kpReadings: z.array(z.object({ time: z.string(), kp: z.number() })),
  currentKp: z.number().nullable(),
  windSpeed: z.number().nullable(),
  windDensity: z.number().nullable(),
  imfBz: z.number().nullable(),
  updatedAt: z.string(),
})

export type SolarWind = z.infer<typeof SolarWindSchema>
