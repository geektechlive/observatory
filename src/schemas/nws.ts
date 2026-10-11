import { z } from 'zod'

export const NwsFeatureSchema = z.object({
  geometry: z.unknown(), // GeoJSON Polygon/MultiPolygon
  /** Legacy, ignored by the client since #38 (colour comes from severity); dropped server-side next. */
  color: z.string().optional(),
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
