import { z } from 'zod'

const SentryObjectSchema = z.object({
  des: z.string(),
  name: z.string().optional(),
  fullname: z.string().optional(),
  ps_cum: z.string().optional(),
  ps_max: z.string().optional(),
  ip: z.string().optional(),
  n_imp: z.string().optional(),
  diameter: z.string().nullable().optional(),
  v_inf: z.string().optional(),
  h: z.string().optional(),
  range: z.string().optional(),
  epoch: z.string().optional(),
})

export const SentryResponseSchema = z.object({
  count: z.string(),
  data: z.array(SentryObjectSchema),
})

export type SentryObject = z.infer<typeof SentryObjectSchema>
export type SentryResponse = z.infer<typeof SentryResponseSchema>
