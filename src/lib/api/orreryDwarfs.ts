import { type OrreryDwarfs, OrreryDwarfsSchema } from '@/schemas/orreryDwarfs'

import { getJsonMeta, type SourceEnvelope } from './client'

/** The dwarf planets, placed with JPL Horizons (#99 item 8): their own endpoint. */
export function fetchOrreryDwarfsEnvelope(): Promise<SourceEnvelope<OrreryDwarfs>> {
  return getJsonMeta('/api/orrery-dwarfs', OrreryDwarfsSchema)
}
