import { z } from 'zod'

export const SunMoonSchema = z.object({
  date: z.string(),
  tz: z.number(),
  lat: z.number(),
  lon: z.number(),
  curPhase: z.string(),
  /** Illuminated fraction, 0-100. */
  fracIllum: z.number(),
  closestPhase: z.object({ phase: z.string(), date: z.string(), time: z.string() }).nullable(),
  sun: z.object({
    rise: z.string().nullable(),
    set: z.string().nullable(),
    transit: z.string().nullable(),
    civilBegin: z.string().nullable(),
    civilEnd: z.string().nullable(),
  }),
  moon: z.object({
    rise: z.string().nullable(),
    set: z.string().nullable(),
  }),
  updatedAt: z.string(),
})

export type SunMoon = z.infer<typeof SunMoonSchema>
