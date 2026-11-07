import { z } from 'zod'

import { SampledSpanSchema } from './orreryBodies'

/**
 * /api/orrery-neo (#92): this month's close approaches to Earth, placed in 3D, plus
 * what JPL Scout and ESA NEOCC say. Built by scripts/orrery-neo.mjs in the refresh job
 * and served straight from KV, like /api/orrery-bodies.
 *
 * Each approach comes from JPL's Close Approach Data (miss distance with its 3-sigma
 * range) and carries Horizons vectors (heliocentric ecliptic J2000, au and au/day,
 * TDB), `fine` as in orrery-bodies: [x, y, z, vx, vy, vz] per sample. Since #136 that
 * is ±30 days at a daily step, plus `close` at 3 h around the pass; copies written
 * before it hold ±10 days at 3 h in `fine` alone. `fine` is null when Horizons could not be asked or answered for the wrong
 * object; the approach is still listed, with the reason in `missing`.
 */
export const CloseApproachSchema = z.object({
  /** JD (TDB) and ISO time of closest approach. */
  jd: z.number(),
  date: z.string(),
  /** Nominal miss distance and its 3-sigma minimum and maximum, au. */
  distAu: z.number(),
  distMinAu: z.number(),
  distMaxAu: z.number(),
  /** Speed relative to Earth at closest approach, and at infinity, km/s. */
  vRelKms: z.number(),
  vInfKms: z.number().nullable(),
  /** 3-sigma uncertainty in the time, as CAD writes it ("< 00:01"). */
  tSigma: z.string(),
})

export const OrreryApproachSchema = z.object({
  /** Namespaced, never a display name: `sb:524522`, `sb:2026 UE2`. */
  id: z.string(),
  /** JPL's designation: the number for numbered objects. */
  des: z.string(),
  /** JPL's full name: "524522 Zoozve (2002 VE68)", "(2026 UE2)". */
  name: z.string(),
  orbitId: z.string(),
  /** On CAD's potentially-hazardous list. */
  pha: z.boolean(),
  /** On ESA NEOCC's risk list (a non-zero chance of impact within 100 years). */
  riskListed: z.boolean(),
  /** Absolute magnitude, and diameter (km) when JPL knows it. */
  h: z.number().nullable(),
  diameterKm: z.number().nullable(),
  closeApproach: CloseApproachSchema,
  /** Horizons' own "Target body name", checked against `des`. */
  target: z.string().nullable(),
  fine: SampledSpanSchema.nullable(),
  /**
   * 3 h samples within ±3 days of closest approach (#136), where Earth bends the path
   * too fast for `fine`'s daily step; null in copies written before #136.
   */
  close: SampledSpanSchema.nullable().default(null),
})

export const ScoutObjectSchema = z.object({
  objectName: z.string(),
  neoScore: z.number().nullable(),
  phaScore: z.number().nullable(),
  neo1kmScore: z.number().nullable(),
  ieoScore: z.number().nullable(),
  geocentricScore: z.number().nullable(),
  tisserandScore: z.number().nullable(),
  rating: z.number().nullable(),
  /** Plane-of-sky position uncertainty now and a day ahead, arcmin. */
  unc: z.number().nullable(),
  uncP1: z.number().nullable(),
  caDistLd: z.number().nullable(),
  moidAu: z.number().nullable(),
  vInfKms: z.number().nullable(),
  h: z.number().nullable(),
  vMag: z.number().nullable(),
  nObs: z.number().nullable(),
  arcHours: z.number().nullable(),
  rmsN: z.number().nullable(),
  lastRun: z.string().nullable(),
})

const NeoccObjectFields = {
  /** Matches an approach's `des`: the number if numbered, else "2026 VZ3". */
  key: z.string(),
  number: z.string().nullable(),
  designation: z.string().nullable(),
  name: z.string().nullable(),
}

export const NeoccRiskEntrySchema = z.object({
  ...NeoccObjectFields,
  diameterM: z.number().nullable(),
  diameterEstimated: z.boolean(),
  impactDate: z.string().nullable(),
  ipMax: z.number().nullable(),
  psMax: z.number().nullable(),
  torino: z.number().nullable(),
  velocityKms: z.number().nullable(),
  years: z.string(),
  ipCum: z.number().nullable(),
  psCum: z.number().nullable(),
})

export const NeoccCloseApproachSchema = z.object({
  ...NeoccObjectFields,
  date: z.string(),
  missKm: z.number().nullable(),
  missAu: z.number().nullable(),
  missLd: z.number().nullable(),
  diameterM: z.number().nullable(),
  diameterEstimated: z.boolean(),
  h: z.number().nullable(),
  maxBrightMag: z.number().nullable(),
  vRelKms: z.number().nullable(),
  caiIndex: z.number().nullable(),
})

export const OrreryNeoSchema = z.object({
  generatedAt: z.string(),
  frame: z.literal('ecliptic-J2000'),
  center: z.literal('Sun'),
  timeScale: z.literal('TDB'),
  units: z.object({ position: z.literal('au'), velocity: z.literal('au/day') }),
  sourceType: z.literal('ephemeris'),
  provider: z.literal('jpl-horizons'),
  /** The CAD query's dates (YYYY-MM-DD), now ±10 days. */
  window: z.object({ from: z.string(), to: z.string() }),
  /** Close approaches within 0.05 au: hazardous objects first, then the closest. */
  approaches: z.array(OrreryApproachSchema),
  /** JPL Scout's unconfirmed objects; null when Scout did not answer. */
  scout: z.object({ objects: z.array(ScoutObjectSchema) }).nullable(),
  /** "ESA also lists": NEOCC's risk list (the top of it) and its upcoming approaches. */
  esa: z.object({
    riskList: z
      .object({
        updated: z.string().nullable(),
        total: z.number(),
        entries: z.array(NeoccRiskEntrySchema),
      })
      .nullable(),
    closeApproaches: z
      .object({ updated: z.string().nullable(), entries: z.array(NeoccCloseApproachSchema) })
      .nullable(),
  }),
  /** Sources or objects the last refresh could not fetch, and why. */
  missing: z.array(z.object({ id: z.string(), reason: z.string() })),
})

export type CloseApproach = z.infer<typeof CloseApproachSchema>
export type OrreryApproach = z.infer<typeof OrreryApproachSchema>
export type ScoutObject = z.infer<typeof ScoutObjectSchema>
export type NeoccRiskEntry = z.infer<typeof NeoccRiskEntrySchema>
export type NeoccCloseApproach = z.infer<typeof NeoccCloseApproachSchema>
export type OrreryNeo = z.infer<typeof OrreryNeoSchema>
