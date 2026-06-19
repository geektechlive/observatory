import { z } from 'zod'

export const GeomagSchema = z.object({
  /** Kyoto Dst index series (nT), oldest → newest. */
  dstSeries: z.array(z.number()),
  currentDst: z.number().nullable(),
  /** Propagated L1 IMF Bz series (nT), downsampled. */
  bzSeries: z.array(z.number()),
  currentBz: z.number().nullable(),
  updatedAt: z.string(),
})

export type Geomag = z.infer<typeof GeomagSchema>
