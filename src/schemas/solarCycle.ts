import { z } from 'zod'

export const SolarCycleSchema = z.object({
  /** Monthly sunspot number since Cycle 25 began (2019), oldest → newest. */
  cycle: z.array(z.object({ month: z.string(), ssn: z.number() })),
  latestSsn: z.number().nullable(),
  latestF107: z.number().nullable(),
  /** 3-hourly Kp forecast (forward-looking window). */
  kpForecast: z.array(
    z.object({
      time: z.string(),
      kp: z.number(),
      kind: z.string(), // estimated | predicted
      scale: z.string().nullable(),
    }),
  ),
  updatedAt: z.string(),
})

export type SolarCycle = z.infer<typeof SolarCycleSchema>
