import { z } from 'zod'

const NeoCloseApproachSchema = z.object({
  close_approach_date: z.string(),
  close_approach_date_full: z.string().optional(),
  miss_distance: z.object({
    kilometers: z.string(),
    lunar: z.string(),
    astronomical: z.string(),
  }),
  relative_velocity: z.object({
    kilometers_per_second: z.string(),
  }),
  orbiting_body: z.string().optional(),
})

const NeoObjectSchema = z.object({
  id: z.string(),
  neo_reference_id: z.string().optional(),
  name: z.string(),
  nasa_jpl_url: z.string().optional(),
  absolute_magnitude_h: z.number(),
  is_potentially_hazardous_asteroid: z.boolean(),
  estimated_diameter: z.object({
    kilometers: z.object({
      estimated_diameter_min: z.number(),
      estimated_diameter_max: z.number(),
    }),
  }),
  close_approach_data: z.array(NeoCloseApproachSchema),
})

export const NeoResponseSchema = z.object({
  element_count: z.number(),
  near_earth_objects: z.record(z.string(), z.array(NeoObjectSchema)),
})

export type NeoCloseApproach = z.infer<typeof NeoCloseApproachSchema>
export type NeoObject = z.infer<typeof NeoObjectSchema>
export type NeoResponse = z.infer<typeof NeoResponseSchema>
