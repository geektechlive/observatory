import { z } from 'zod'

import { SAT_FIELDS, SAT_GROUPS, type SatGroupId } from '@/lib/orbit/satCatalog'

/**
 * /api/orrery-sats?group= (#98): one CelesTrak group as stored by the refresh job
 * (scripts/celestrak-groups.mjs), compact rows in SAT_FIELDS order. Rows are checked
 * one by one in the worker (decodeSatGroup), not here: a zod tuple per row costs too
 * much across 11,000 Starlinks.
 */
const GROUP_IDS = SAT_GROUPS.map((g) => g.id) as [SatGroupId, ...SatGroupId[]]

export const OrrerySatsSchema = z.object({
  group: z.enum(GROUP_IDS),
  label: z.string(),
  category: z.string(),
  source: z.literal('celestrak'),
  celestrakGroup: z.string(),
  generatedAt: z.string(),
  fields: z
    .array(z.string())
    .refine(
      (f) => f.length === SAT_FIELDS.length && f.every((name, i) => name === SAT_FIELDS[i]),
      'fields are not the catalogue columns',
    ),
  count: z.number().int().nonnegative(),
  /** Starlink only (#209): the first supgpCount rows carry CelesTrak SupGP elements. */
  supgpCount: z.number().int().nonnegative().optional(),
  rows: z.array(z.unknown()),
})

export type OrrerySats = z.infer<typeof OrrerySatsSchema>
