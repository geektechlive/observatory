/**
 * The normalised object model (#91; Chris's spec Part 8), as zod schemas so the
 * endpoints that arrive in #92/#93 validate against the same shapes the inspector reads.
 * Positions say where they came from: a model is never presented as an observation.
 */
import { z } from 'zod'

export const ObjectCategorySchema = z.enum([
  'star',
  'planet',
  'moon',
  'asteroid',
  'comet',
  'satellite',
  'space_station',
  'space_telescope',
  'spacecraft',
  'debris',
  'rocket_body',
  'fireball_event',
  'unknown',
])
export type ObjectCategory = z.infer<typeof ObjectCategorySchema>

export const PositionSourceTypeSchema = z.enum([
  'observed',
  'ephemeris',
  'sgp4_propagated',
  'numerically_propagated',
  'kepler_approximation',
  'historical_event',
])
export type PositionSourceType = z.infer<typeof PositionSourceTypeSchema>

export const PositionConfidenceSchema = z.enum(['high', 'medium', 'low', 'unknown'])
export type PositionConfidence = z.infer<typeof PositionConfidenceSchema>

const Vector3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() })

export const OrbitalStateSchema = z.object({
  timestampUTC: z.string(),
  /** Position in au (the spec stores km; the wire and the maths use au, converted at display). */
  positionAu: Vector3Schema,
  velocityAuPerDay: Vector3Schema.optional(),
  referenceFrame: z.string(),
  referenceCenter: z.string(),
  timeScale: z.string(),
  sourceType: PositionSourceTypeSchema,
  sourceProvider: z.string(),
  sourceEpochUTC: z.string().optional(),
  accuracyDescription: z.string().optional(),
  confidence: PositionConfidenceSchema,
  /** Part 16: why the confidence is what it is. Reasons, never invented percentages. */
  confidenceReasons: z.array(z.string()),
})
export type OrbitalState = z.infer<typeof OrbitalStateSchema>

export const SpaceObjectSchema = z.object({
  /** Namespaced, never a display name: `naif:499`, `norad:25544`. */
  id: z.string(),
  name: z.string(),
  category: ObjectCategorySchema,
  identifiers: z.object({
    noradId: z.string().optional(),
    internationalDesignator: z.string().optional(),
    naifId: z.string().optional(),
    mpcDesignation: z.string().optional(),
    jplSpkId: z.string().optional(),
  }),
  description: z.string().optional(),
  sourceProviders: z.array(z.string()),
})
export type SpaceObject = z.infer<typeof SpaceObjectSchema>
