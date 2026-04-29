import { z } from 'zod'

const EonetCategorySchema = z.object({
  id: z.string(),
  title: z.string(),
})

const EonetSourceSchema = z.object({
  id: z.string(),
  url: z.string(),
})

// Coordinates are `unknown` here; components narrow to Point via type guard
const EonetGeometrySchema = z.object({
  type: z.string(),
  magnitudeValue: z.number().nullable().optional(),
  magnitudeUnit: z.string().nullable().optional(),
  date: z.string(),
  coordinates: z.unknown(),
})

const EonetEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  link: z.string(),
  closed: z.string().nullable().optional(),
  categories: z.array(EonetCategorySchema),
  sources: z.array(EonetSourceSchema),
  geometry: z.array(EonetGeometrySchema),
})

export const EonetResponseSchema = z.object({
  title: z.string(),
  description: z.string(),
  link: z.string(),
  events: z.array(EonetEventSchema),
})

export type EonetCategory = z.infer<typeof EonetCategorySchema>
export type EonetGeometry = z.infer<typeof EonetGeometrySchema>
export type EonetEvent = z.infer<typeof EonetEventSchema>
export type EonetResponse = z.infer<typeof EonetResponseSchema>

/** Type guard: narrows geometry to a valid GeoJSON Point with [lon, lat] coords */
export function isPointGeometry(
  g: EonetGeometry,
): g is EonetGeometry & { type: 'Point'; coordinates: [number, number] } {
  return (
    g.type === 'Point' &&
    Array.isArray(g.coordinates) &&
    g.coordinates.length === 2 &&
    typeof (g.coordinates as unknown[])[0] === 'number' &&
    typeof (g.coordinates as unknown[])[1] === 'number'
  )
}
