import { z } from 'zod'

const LaunchStatusSchema = z.object({
  id: z.number(),
  name: z.string(),
  abbrev: z.string(),
})

const LaunchConfigSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  full_name: z.string().optional().nullable(),
})

const RocketSchema = z.object({
  configuration: LaunchConfigSchema,
})

const PadLocationSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
})

const PadSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  location: PadLocationSchema.optional().nullable(),
})

const MissionSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  type: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
})

const LaunchSchema = z.object({
  id: z.string(),
  name: z.string(),
  net: z.string().nullable(),
  status: LaunchStatusSchema,
  rocket: RocketSchema.optional().nullable(),
  launch_service_provider: z
    .object({ id: z.number().optional(), name: z.string() })
    .optional()
    .nullable(),
  pad: PadSchema.optional().nullable(),
  mission: MissionSchema.optional().nullable(),
})

export const LaunchesResponseSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(LaunchSchema),
})

export type Launch = z.infer<typeof LaunchSchema>
export type LaunchesResponse = z.infer<typeof LaunchesResponseSchema>
