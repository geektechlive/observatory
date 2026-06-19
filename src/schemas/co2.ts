import { z } from 'zod'

export const Co2Schema = z.object({
  ppm: z.number(),
  date: z.string(),
  yearAgo: z.number().nullable(),
  updatedAt: z.string(),
})

export type Co2 = z.infer<typeof Co2Schema>
