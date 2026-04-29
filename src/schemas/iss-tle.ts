import { z } from 'zod'

export const IssTleSchema = z.object({
  name: z.string(),
  line1: z.string(),
  line2: z.string(),
})

export type IssTle = z.infer<typeof IssTleSchema>
