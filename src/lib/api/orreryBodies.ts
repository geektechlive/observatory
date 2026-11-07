import { type OrreryBodies, OrreryBodiesSchema } from '@/schemas/orreryBodies'

import { getJsonMeta, type SourceEnvelope } from './client'

/** Craft, Earth and Moon from JPL Horizons, sampled by the refresh job (#93). */
export function fetchOrreryBodiesEnvelope(): Promise<SourceEnvelope<OrreryBodies>> {
  return getJsonMeta('/api/orrery-bodies', OrreryBodiesSchema)
}
