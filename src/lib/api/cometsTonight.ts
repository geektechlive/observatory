import { type CometsTonightData, CometsTonightSchema } from '@/schemas/cometsTonight'

import { getJsonMeta, type SourceEnvelope } from './client'

/** The Tonight panel's comets: a week of each one's span, cut by the refresh job (#135). */
export function fetchCometsTonightEnvelope(): Promise<SourceEnvelope<CometsTonightData>> {
  return getJsonMeta('/api/comets-tonight', CometsTonightSchema)
}
