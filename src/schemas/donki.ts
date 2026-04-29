import { z } from 'zod'

export const SolarFlareSchema = z.object({
  flrID: z.string(),
  beginTime: z.string(),
  peakTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  classType: z.string().nullable().optional(),
  sourceLocation: z.string().nullable().optional(),
  activeRegionNum: z.number().nullable().optional(),
})

export const CmeSchema = z.object({
  activityID: z.string(),
  startTime: z.string(),
  sourceLocation: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  speed: z.number().nullable().optional(),
  note: z.string().nullable().optional(),
})

const KpIndexSchema = z.object({
  observedTime: z.string(),
  kpIndex: z.number(),
  source: z.string(),
})

export const GeomagneticStormSchema = z.object({
  gstID: z.string(),
  startTime: z.string(),
  allKpIndex: z.array(KpIndexSchema).optional(),
})

export const SepSchema = z.object({
  sepID: z.string(),
  eventTime: z.string(),
  instruments: z.array(z.object({ id: z.number().optional(), displayName: z.string() })).optional(),
})

export const DonkiResponseSchema = z.object({
  flares: z.array(SolarFlareSchema),
  cmes: z.array(CmeSchema),
  geomagneticStorms: z.array(GeomagneticStormSchema),
  seps: z.array(SepSchema),
})

export type SolarFlare = z.infer<typeof SolarFlareSchema>
export type Cme = z.infer<typeof CmeSchema>
export type GeomagneticStorm = z.infer<typeof GeomagneticStormSchema>
export type Sep = z.infer<typeof SepSchema>
export type DonkiResponse = z.infer<typeof DonkiResponseSchema>
