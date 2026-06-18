import { z } from 'zod'

export const PlanetSchema = z.object({
  name: z.string(),
  raHours: z.number(),
  decDeg: z.number(),
  mag: z.number().nullable(),
  /** Solar elongation, degrees (0 for the Sun). */
  elongation: z.number(),
})

export const PlanetsResponseSchema = z.object({
  bodies: z.array(PlanetSchema),
  updatedAt: z.string(),
})

export type Planet = z.infer<typeof PlanetSchema>
export type PlanetsResponse = z.infer<typeof PlanetsResponseSchema>
