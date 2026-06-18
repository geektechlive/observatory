import { z } from 'zod'

export const SolarWindSchema = z.object({
  kpReadings: z.array(z.object({ time: z.string(), kp: z.number() })),
  currentKp: z.number().nullable(),
  windSpeed: z.number().nullable(),
  windDensity: z.number().nullable(),
  imfBz: z.number().nullable(),
  // ~24h downsampled trend series; default [] keeps older cached payloads valid.
  windSpeedSeries: z.array(z.number()).default([]),
  windDensitySeries: z.array(z.number()).default([]),
  imfBzSeries: z.array(z.number()).default([]),
  updatedAt: z.string(),
})

export type SolarWind = z.infer<typeof SolarWindSchema>
