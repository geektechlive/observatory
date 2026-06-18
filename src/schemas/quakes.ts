import { z } from 'zod'

export const QuakeSchema = z.object({
  id: z.string(),
  mag: z.number().nullable(),
  place: z.string(),
  lat: z.number(),
  lon: z.number(),
  depthKm: z.number().nullable(),
  time: z.number(), // unix ms
  tsunami: z.boolean(),
  url: z.string(),
})

export const QuakesResponseSchema = z.object({
  updatedAt: z.string(),
  quakes: z.array(QuakeSchema),
})

export type Quake = z.infer<typeof QuakeSchema>
export type QuakesResponse = z.infer<typeof QuakesResponseSchema>
