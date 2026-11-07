import {
  type Discos,
  DiscosSchema,
  type SatcatShard,
  SatcatShardSchema,
  type SpaceTrack,
  SpaceTrackSchema,
} from '@/schemas/spaceTrack'

import { getJsonMeta, type SourceEnvelope } from './client'

/** Space-Track's re-entries, recent decays and Box Score (#101). */
export function fetchSpaceTrackEnvelope(): Promise<SourceEnvelope<SpaceTrack>> {
  return getJsonMeta('/api/spacetrack?part=catalog', SpaceTrackSchema)
}

/** One SATCAT shard (satcatShardOf in src/lib/spacetrack.ts says which). */
export async function fetchSatcatShard(shard: number): Promise<SatcatShard> {
  const { data } = await getJsonMeta(
    `/api/spacetrack?part=satcat&shard=${String(shard)}`,
    SatcatShardSchema,
  )
  return data
}

/** ESA DISCOS facts for the craft and a few dozen satellites (#101). */
export function fetchDiscosEnvelope(): Promise<SourceEnvelope<Discos>> {
  return getJsonMeta('/api/discos', DiscosSchema)
}
