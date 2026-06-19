import { z } from 'zod'

export const ExoplanetsSchema = z.object({
  count: z.number(),
  updatedAt: z.string(),
})

export type Exoplanets = z.infer<typeof ExoplanetsSchema>
