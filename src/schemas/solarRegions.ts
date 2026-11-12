import { z } from 'zod'

// /api/solar-regions (#210). Nullable fields, never unions: unions pull union code into
// the first load (docs/reference/bundle-and-loading.md).

export const FlareOddsSchema = z.object({
  issued: z.string(),
  forDate: z.string(),
  c: z.number(),
  m: z.number(),
  x: z.number(),
  proton: z.number(),
})

export const ActiveRegionSchema = z.object({
  region: z.number(),
  location: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  area: z.number().nullable(),
  // Null on an early day, before SWPC compiles its region summary (#213).
  spotClass: z.string().nullable(),
  magClass: z.string().nullable(),
  spots: z.number().nullable(),
  c: z.number().nullable(),
  m: z.number().nullable(),
  x: z.number().nullable(),
  proton: z.number().nullable(),
})

export const SolarRegionsSchema = z.object({
  probabilities: FlareOddsSchema.nullable(),
  regions: z
    .object({
      observedDate: z.string(),
      validAt: z.string(),
      preliminary: z.boolean(),
      items: z.array(ActiveRegionSchema),
    })
    .nullable(),
  updatedAt: z.string(),
})

export type FlareOdds = z.infer<typeof FlareOddsSchema>
export type ActiveRegion = z.infer<typeof ActiveRegionSchema>
export type SolarRegions = z.infer<typeof SolarRegionsSchema>
