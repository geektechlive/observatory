import { type OrrerySmallBodies, OrrerySmallBodiesSchema } from '@/schemas/orrerySmallBodies'

import { getJsonMeta, type SourceEnvelope } from './client'

/** Comets and the interstellar objects, placed with JPL Horizons (#99). */
export function fetchOrrerySmallBodiesEnvelope(): Promise<SourceEnvelope<OrrerySmallBodies>> {
  return getJsonMeta('/api/orrery-smallbodies', OrrerySmallBodiesSchema)
}
