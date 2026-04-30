import { z } from 'zod'

const RawEpicImageSchema = z.object({
  identifier: z.string(),
  caption: z.string(),
  image: z.string(),
  date: z.string(),
  centroid_coordinates: z.object({ lat: z.number(), lon: z.number() }),
})

export const RawEpicArraySchema = z.array(RawEpicImageSchema)

export const EpicResponseSchema = z.object({
  image: z.string(),
  date: z.string(),
  caption: z.string(),
  centroidLat: z.number(),
  centroidLon: z.number(),
  year: z.string(),
  month: z.string(),
  day: z.string(),
})

export type EpicResponse = z.infer<typeof EpicResponseSchema>
