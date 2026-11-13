import { z } from 'zod'

/**
 * /api/spacetrack (#101): what the refresh job (scripts/spacetrack.mjs) built from
 * Space-Track.org. The catalogue: TIP re-entry predictions (newest message per object,
 * soonest first), re-entries of the last 30 days, the Box Score's totals, and names for
 * the objects listed. Each part is null until it was first fetched.
 */
const ReentrySchema = z.object({
  noradId: z.string(),
  decayEpoch: z.string(),
  windowMin: z.number(),
  msgEpoch: z.string(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  highInterest: z.boolean(),
})

const DecaySchema = z.object({
  noradId: z.string(),
  name: z.string(),
  country: z.string(),
  decayEpoch: z.string(),
  msgEpoch: z.string(),
  kind: z.enum(['historical', 'prediction']),
})

export const SpaceTrackSchema = z.object({
  generatedAt: z.string(),
  citation: z.string(),
  tip: z
    .object({
      fetchedAt: z.string(),
      reentries: z.array(ReentrySchema),
      // The reentering objects' elements (#154), compact rows like /api/orrery-sats. Left
      // unchecked on purpose: this schema is in the first load, and the orrery chunk
      // checks each row (lib/orrery/reentryElements.ts). Absent before the first run
      // that asked for them.
      elements: z.unknown().optional(),
    })
    .nullable(),
  decays: z.object({ fetchedAt: z.string(), recent: z.array(DecaySchema) }).nullable(),
  boxscore: z
    .object({
      fetchedAt: z.string(),
      inOrbit: z.object({
        payload: z.number(),
        rocketBody: z.number(),
        debris: z.number(),
        unassigned: z.number(),
        total: z.number(),
      }),
      decayed: z.object({
        payload: z.number(),
        rocketBody: z.number(),
        debris: z.number(),
        total: z.number(),
      }),
      catalogued: z.number(),
    })
    .nullable(),
  satcatAt: z.string().nullable(),
  names: z.record(z.string(), z.string()),
  missing: z.array(z.object({ id: z.string(), reason: z.string() })),
})

export type SpaceTrack = z.infer<typeof SpaceTrackSchema>
export type Reentry = z.infer<typeof ReentrySchema>

/** One SATCAT shard: compact rows, [NORAD, COSPAR, type, owner, launch, site, radar size]. */
export const SatcatShardSchema = z.object({
  generatedAt: z.string(),
  citation: z.string(),
  shard: z.number().int(),
  rows: z.array(
    z.tuple([z.string(), z.string(), z.string(), z.string(), z.string(), z.string(), z.string()]),
  ),
})

export type SatcatShard = z.infer<typeof SatcatShardSchema>

/** /api/discos (#101): ESA DISCOS facts, craft by NAIF id and satellites by NORAD number. */
const DiscosObjectSchema = z.object({
  satno: z.string().nullable(),
  cosparId: z.string().nullable(),
  name: z.string(),
  objectClass: z.string().nullable(),
  massKg: z.number().nullable(),
  shape: z.string().nullable(),
  widthM: z.number().nullable(),
  heightM: z.number().nullable(),
  depthM: z.number().nullable(),
  diameterM: z.number().nullable(),
  spanM: z.number().nullable(),
  operators: z.array(z.string()),
  firstEpoch: z.string().nullable(),
  fetchedAt: z.string(),
})

export const DiscosSchema = z.object({
  generatedAt: z.string(),
  citation: z.string(),
  craft: z.record(z.string(), DiscosObjectSchema),
  satellites: z.record(z.string(), DiscosObjectSchema),
  missing: z.array(z.object({ id: z.string(), reason: z.string() })),
})

export type Discos = z.infer<typeof DiscosSchema>
export type DiscosObject = z.infer<typeof DiscosObjectSchema>
