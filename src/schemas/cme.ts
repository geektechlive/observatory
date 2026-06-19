import { z } from 'zod'

export const CmeSchema = z.object({
  /** Is an Earth-directed CME modeled in the ENLIL run? */
  inbound: z.boolean(),
  arrival: z.string().nullable(),
  /** Modeled solar wind at Earth. */
  earthSpeed: z.number().nullable(),
  earthDensity: z.number().nullable(),
  updatedAt: z.string(),
})

export type Cme = z.infer<typeof CmeSchema>
