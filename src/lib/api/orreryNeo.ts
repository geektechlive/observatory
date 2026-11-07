import { type OrreryNeo, OrreryNeoSchema } from '@/schemas/orreryNeo'

import { getJsonMeta, type SourceEnvelope } from './client'

/** Close approaches placed with JPL Horizons, plus Scout and ESA NEOCC (#92). */
export function fetchOrreryNeoEnvelope(): Promise<SourceEnvelope<OrreryNeo>> {
  return getJsonMeta('/api/orrery-neo', OrreryNeoSchema)
}
