import { z } from 'zod'

const RLLProviderSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string().optional().nullable(),
})

const RLLVehicleSchema = z.object({
  id: z.number(),
  name: z.string(),
})

const RLLLocationSchema = z.object({
  id: z.number(),
  name: z.string(),
  state: z.string().optional().nullable(),
  statename: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  slug: z.string().optional().nullable(),
})

const RLLPadSchema = z.object({
  id: z.number(),
  name: z.string(),
  latitude: z.string().optional().nullable(),
  longitude: z.string().optional().nullable(),
  location: RLLLocationSchema.optional().nullable(),
})

const RLLTagSchema = z.object({
  id: z.number(),
  text: z.string(),
})

const RLLLaunchSchema = z.object({
  id: z.number(),
  name: z.string(),
  sort_date: z.string(),
  t0: z.string().optional().nullable(),
  win_open: z.string().optional().nullable(),
  win_close: z.string().optional().nullable(),
  date_str: z.string().optional().nullable(),
  provider: RLLProviderSchema.optional().nullable(),
  vehicle: RLLVehicleSchema.optional().nullable(),
  pad: RLLPadSchema.optional().nullable(),
  launch_description: z.string().optional().nullable(),
  slug: z.string().optional().nullable(),
  weather_condition: z.string().optional().nullable(),
  weather_temp: z.string().optional().nullable(),
  weather_wind_mph: z.string().optional().nullable(),
  tags: z.array(RLLTagSchema).optional().nullable(),
  suborbital: z.boolean().optional().nullable(),
})

export const LaunchesResponseSchema = z.object({
  valid_auth: z.boolean(),
  count: z.number(),
  result: z.array(RLLLaunchSchema),
})

export type RLLLaunch = z.infer<typeof RLLLaunchSchema>
export type LaunchesResponse = z.infer<typeof LaunchesResponseSchema>
