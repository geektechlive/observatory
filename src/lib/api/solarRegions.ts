import { getJsonMeta, type SourceEnvelope } from '@/lib/api/client'
import { type SolarRegions, SolarRegionsSchema } from '@/schemas/solarRegions'

/** SWPC active regions and flare odds (#210), with the headers the header grades by. */
export function fetchSolarRegionsEnvelope(): Promise<SourceEnvelope<SolarRegions>> {
  return getJsonMeta('/api/solar-regions', SolarRegionsSchema)
}
