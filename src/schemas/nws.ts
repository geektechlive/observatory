import { z } from 'zod'

export const NwsFeatureSchema = z.object({
  geometry: z.unknown(), // GeoJSON Polygon/MultiPolygon
  color: z.string(),
  event: z.string(),
  severity: z.string(),
  headline: z.string(),
})

export const NwsAlertsSchema = z.object({
  features: z.array(NwsFeatureSchema),
  updatedAt: z.string(),
})

export type NwsFeature = z.infer<typeof NwsFeatureSchema>
export type NwsAlerts = z.infer<typeof NwsAlertsSchema>
