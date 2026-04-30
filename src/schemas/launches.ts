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
  country: z.string().optional().nullable(),
})

const RLLPadSchema = z.object({
  id: z.number(),
  name: z.string(),
  location: RLLLocationSchema.optional().nullable(),
})

const RLLLaunchSchema = z.object({
  id: z.number(),
  name: z.string(),
  sort_date: z.string(),
  t0: z.string().optional().nullable(),
  win_open: z.string().optional().nullable(),
  date_str: z.string().optional().nullable(),
  provider: RLLProviderSchema.optional().nullable(),
  vehicle: RLLVehicleSchema.optional().nullable(),
  pad: RLLPadSchema.optional().nullable(),
  launch_description: z.string().optional().nullable(),
})

export const LaunchesResponseSchema = z.object({
  valid_auth: z.boolean(),
  count: z.number(),
  result: z.array(RLLLaunchSchema),
})

export type RLLLaunch = z.infer<typeof RLLLaunchSchema>
export type LaunchesResponse = z.infer<typeof LaunchesResponseSchema>
