import { z } from 'zod'

const stamp = z.iso.datetime().nullable()

export const SdoTimesSchema = z.object({
  times: z.object({
    '0171': stamp,
    '0193': stamp,
    '0211': stamp,
    '0304': stamp,
    HMIB: stamp,
  }),
  updatedAt: z.string(),
})

export type SdoTimesResponse = z.infer<typeof SdoTimesSchema>
