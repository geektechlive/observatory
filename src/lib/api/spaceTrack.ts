import {
  type Discos,
  DiscosSchema,
  type SatcatShard,
  SatcatShardSchema,
  type SpaceTrack,
  SpaceTrackSchema,
} from '@/schemas/spaceTrack'

import { getJson, getJsonMeta, type SourceEnvelope } from './client'

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

export interface SatcatEntry {
  noradId: string
  intlDes: string
  objectType: string
  country: string
  launch: string
  site: string
  rcsSize: string
}

/** A satellite's SATCAT row from its shard, or null when it isn't there. */
export function satcatEntry(shard: SatcatShard, noradId: string): SatcatEntry | null {
  const row = shard.rows.find((r) => r[0] === noradId)
  if (!row) return null
  const [id, intlDes, objectType, country, launch, site, rcsSize] = row
  return { noradId: id, intlDes, objectType, country, launch, site, rcsSize }
}
