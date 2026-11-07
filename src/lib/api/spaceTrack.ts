import { type SatcatEntry, satcatEntryOf } from '@/lib/spacetrack'
import {
  type Discos,
  DiscosSchema,
  type SatcatShard,
  SatcatShardSchema,
  type SpaceTrack,
  SpaceTrackSchema,
} from '@/schemas/spaceTrack'

import { getJson, getJsonMeta, type SourceEnvelope } from './client'

export type { SatcatEntry } from '@/lib/spacetrack'

/** Space-Track's re-entries, recent decays and Box Score (#101). */
export function fetchSpaceTrackEnvelope(): Promise<SourceEnvelope<SpaceTrack>> {
  return getJsonMeta('/api/spacetrack?part=catalog', SpaceTrackSchema)
}

/** One SATCAT shard (satcatShardOf in src/lib/spacetrack.ts says which). */
export function fetchSatcatShard(shard: number): Promise<SatcatShard> {
  return getJson(`/api/spacetrack?part=satcat&shard=${String(shard)}`, SatcatShardSchema)
}

/** ESA DISCOS facts for the craft and a few dozen satellites (#101). */
export function fetchDiscosEnvelope(): Promise<SourceEnvelope<Discos>> {
  return getJsonMeta('/api/discos', DiscosSchema)
}

/** A satellite's SATCAT row from its shard, or null when it isn't there. */
export function satcatEntry(shard: SatcatShard, noradId: string): SatcatEntry | null {
  return satcatEntryOf(shard.rows, noradId)
}
