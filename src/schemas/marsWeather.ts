import { z } from 'zod'

export const MarsWeatherSchema = z.object({
  sol: z.number(),
  terrestrialDate: z.string(),
  minTemp: z.number().nullable(),
  maxTemp: z.number().nullable(),
  pressure: z.number().nullable(),
  opacity: z.string().nullable(),
  season: z.string().nullable(),
  sunrise: z.string().nullable(),
  sunset: z.string().nullable(),
  uv: z.string().nullable(),
  updatedAt: z.string(),
})

export type MarsWeather = z.infer<typeof MarsWeatherSchema>
