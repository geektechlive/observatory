import { z } from 'zod'

const odds = z.object({ m5: z.number().min(0).max(1), m6: z.number().min(0).max(1) })

/** /api/aftershocks: USGS aftershock forecasts for the strongest recent quakes (#76). */
export const AftershocksSchema = z.object({
  forecasts: z.array(
    z.object({
      id: z.string(),
      mag: z.number(),
      place: z.string(),
      time: z.number(),
      url: z.string(),
      /** Probability of at least one aftershock of M5+ / M6+ in the next day. */
      day: odds,
      /** The same over the next week. */
      week: odds,
    }),
  ),
  updatedAt: z.string(),
})

export type AftershocksResponse = z.infer<typeof AftershocksSchema>
export type AftershockForecast = AftershocksResponse['forecasts'][number]
