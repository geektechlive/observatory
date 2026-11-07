import { z } from 'zod'

import type { LookupResult } from '../lib/orrery/jplLookup'
import { SampledSpanSchema } from './orreryBodies'

/**
 * /api/lookup and /api/trajectory (#100): any small body, on demand, from JPL SBDB and
 * Horizons through the jpl-queue Durable Object. Provenance travels with the data as in
 * /api/orrery-bodies (Chris's spec Part 8).
 */
export const LookupObjectSchema = z.object({
  /** `sb:<SPK-ID>`. */
  id: z.string(),
  spkid: z.string(),
  name: z.string(),
  designation: z.string(),
  prefix: z.string().nullable(),
  kind: z.enum(['asteroid', 'comet']),
  orbitClass: z.object({ code: z.string(), name: z.string() }).nullable(),
  neo: z.boolean(),
  pha: z.boolean(),
})

/**
 * One shape for the three answers, narrowed by `readLookupResult`. Flat on purpose: a
 * zod union would pull its code into the shared first-load chunk (+0.5 kB gzip,
 * measured 2026-11-07), because no other schema in the app uses one.
 */
export const LookupResultSchema = z.object({
  type: z.enum(['object', 'list', 'none']),
  object: LookupObjectSchema.optional(),
  count: z.number().optional(),
  matches: z.array(z.object({ designation: z.string(), name: z.string() })).optional(),
})

export const LookupResponseSchema = z.object({
  query: z.string(),
  provider: z.literal('jpl-sbdb'),
  result: LookupResultSchema,
})

/** A validated lookup answer, narrowed to its kind; null if it doesn't fit. */
export function readLookupResult(raw: unknown): LookupResult | null {
  const parsed = LookupResultSchema.safeParse(raw)
  if (!parsed.success) return null
  const r = parsed.data
  if (r.type === 'object') return r.object ? { type: 'object', object: r.object } : null
  if (r.type === 'list') {
    return r.matches
      ? { type: 'list', count: r.count ?? r.matches.length, matches: r.matches }
      : null
  }
  return { type: 'none' }
}

export interface LookupResponse {
  query: string
  provider: 'jpl-sbdb'
  result: LookupResult
}

export function readLookupResponse(raw: unknown): LookupResponse | null {
  const parsed = LookupResponseSchema.safeParse(raw)
  if (!parsed.success) return null
  const result = readLookupResult(parsed.data.result)
  return result ? { query: parsed.data.query, provider: 'jpl-sbdb', result } : null
}

export const TrajectoryResponseSchema = z.object({
  generatedAt: z.string(),
  frame: z.literal('ecliptic-J2000'),
  center: z.literal('Sun'),
  timeScale: z.literal('TDB'),
  units: z.object({ position: z.literal('au'), velocity: z.literal('au/day') }),
  sourceType: z.literal('ephemeris'),
  provider: z.literal('jpl-horizons'),
  object: LookupObjectSchema,
  /** Horizons' own "Target body name", so a mix-up of ids is visible. */
  target: z.string().nullable(),
  request: z.object({ start: z.string(), end: z.string(), stepMinutes: z.number() }),
  /** Position and velocity, six numbers per sample; null when Horizons has no ephemeris. */
  fine: SampledSpanSchema.nullable(),
  /** Where Horizons' ephemeris starts or ends, when it refused the span (ISO). */
  availableFrom: z.string().nullable(),
  availableTo: z.string().nullable(),
})

export type LookupObject = z.infer<typeof LookupObjectSchema>
export type TrajectoryResponse = z.infer<typeof TrajectoryResponseSchema>
