import { z } from 'zod'

export const FireballSchema = z.object({
  date: z.string(),
  energy: z.string().nullable(),
  impactE: z.string().nullable(),
  lat: z.string().nullable(),
  latDir: z.string().nullable(),
  lon: z.string().nullable(),
  lonDir: z.string().nullable(),
  alt: z.string().nullable(),
  vel: z.string().nullable(),
})

export const FireballResponseSchema = z.object({
  count: z.string(),
  data: z.array(FireballSchema),
})

export type Fireball = z.infer<typeof FireballSchema>
export type FireballResponse = z.infer<typeof FireballResponseSchema>
