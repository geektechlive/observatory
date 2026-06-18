import { z } from 'zod'

export const AstronautSchema = z.object({
  name: z.string(),
  craft: z.string(),
  country: z.string(),
  agency: z.string(),
  flagCode: z.string().nullable(),
  /** Launch time, unix seconds (for client-side days-in-space). */
  launched: z.number().nullable(),
})

export const PeopleInSpaceSchema = z.object({
  number: z.number(),
  expedition: z.string().nullable(),
  people: z.array(AstronautSchema),
  updatedAt: z.string(),
})

export type Astronaut = z.infer<typeof AstronautSchema>
export type PeopleInSpace = z.infer<typeof PeopleInSpaceSchema>
