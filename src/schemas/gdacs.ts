import { z } from 'zod'

export const GdacsEventSchema = z.object({
  id: z.string(),
  type: z.string(), // EQ | TC | FL | VO | WF | DR
  name: z.string(),
  alert: z.string(), // Orange | Red
  lat: z.number(),
  lon: z.number(),
  country: z.string(),
  from: z.string(),
})

export const GdacsResponseSchema = z.object({
  events: z.array(GdacsEventSchema),
  updatedAt: z.string(),
})

export type GdacsEvent = z.infer<typeof GdacsEventSchema>
export type GdacsResponse = z.infer<typeof GdacsResponseSchema>
