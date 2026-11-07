import { z } from 'zod'

/**
 * /api/orrery-bodies (#93): spacecraft, Earth and the Moon from JPL Horizons, sampled
 * by scripts/refresh-data.mjs and served straight from KV. Provenance travels with the
 * data (Chris's spec Part 8): frame, centre, time scale, units, and what kind of
 * position it is.
 *
 * Samples are uniform in time, so they are flat arrays: sample i is at
 * `start + i * step` (Julian date, TDB). `fine` carries position and velocity
 * ([x, y, z, vx, vy, vz] per sample, au and au/day) for Hermite interpolation; `coarse`
 * covers the whole mission with positions only ([x, y, z] per sample), for trajectory
 * lines and for dates outside the fine window.
 */
export const SampledSpanSchema = z.object({
  /** Julian date (TDB) of the first sample. */
  start: z.number(),
  /** Days between samples. */
  step: z.number().positive(),
  samples: z.array(z.number()),
})

export const OrreryBodyGroupSchema = z.enum(['deep-space', 'mission', 'l1', 'planet', 'moon'])

export const OrreryTrackSchema = z.object({
  /** Namespaced, never a display name: `naif:-31`. */
  id: z.string(),
  naifId: z.string(),
  name: z.string(),
  mission: z.string(),
  category: z.enum(['spacecraft', 'space_telescope', 'planet', 'moon']),
  group: OrreryBodyGroupSchema,
  /** Horizons' own "Target body name", so a mix-up of ids is visible. */
  target: z.string().nullable(),
  /** Up to when the trajectory rests on tracking data (YYYY-MM-DD); a prediction after. */
  observedUntil: z.string().nullable(),
  /** Where Horizons' ephemeris starts and ends, when it told us (ISO). */
  availableFrom: z.string().nullable(),
  availableTo: z.string().nullable(),
  fine: SampledSpanSchema.nullable(),
  coarse: SampledSpanSchema.nullable(),
})

/**
 * A major moon (#107). Its vectors are relative to its planet (`center`, Horizons'
 * `500@599` for Jupiter), not to the Sun, in the payload's frame and units. They live
 * apart from `bodies` so a reader that predates moons drops them (zod strips unknown
 * keys) instead of drawing planet-centred vectors as heliocentric ones.
 */
export const OrreryMoonSchema = z.object({
  id: z.string(),
  naifId: z.string(),
  name: z.string(),
  parent: z.object({ naifId: z.string(), name: z.string() }),
  center: z.string(),
  target: z.string().nullable(),
  periodDays: z.number().positive(),
  semiMajorAxisKm: z.number().positive(),
  /** Position and velocity, six numbers per sample, as `fine` above. */
  fine: SampledSpanSchema,
})

export const OrreryBodiesSchema = z.object({
  generatedAt: z.string(),
  /** When the whole-mission spans were last fetched (they are refetched once a day). */
  coarseFetchedAt: z.string().nullable(),
  frame: z.literal('ecliptic-J2000'),
  center: z.literal('Sun'),
  timeScale: z.literal('TDB'),
  units: z.object({ position: z.literal('au'), velocity: z.literal('au/day') }),
  sourceType: z.literal('ephemeris'),
  provider: z.literal('jpl-horizons'),
  bodies: z.array(OrreryTrackSchema),
  /** Planet-centred moons (#107); absent in copies written before them. */
  moons: z.array(OrreryMoonSchema).default([]),
  /** Objects the last refresh could not fetch, and why. */
  missing: z.array(z.object({ id: z.string(), reason: z.string() })),
})

export type SampledSpan = z.infer<typeof SampledSpanSchema>
export type OrreryBodyGroup = z.infer<typeof OrreryBodyGroupSchema>
export type OrreryTrack = z.infer<typeof OrreryTrackSchema>
export type OrreryMoon = z.infer<typeof OrreryMoonSchema>
export type OrreryBodies = z.infer<typeof OrreryBodiesSchema>
