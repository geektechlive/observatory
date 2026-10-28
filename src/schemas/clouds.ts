import { z } from 'zod'

/** Open-Meteo hourly cloud cover (#79): Unix seconds and percent, index-aligned. */
export const CloudsSchema = z.object({
  hourly: z.object({
    time: z.array(z.number()),
    cloud_cover: z.array(z.number().min(0).max(100).nullable()),
  }),
})

export type Clouds = z.infer<typeof CloudsSchema>
