import { useSatcatEntry } from '@/hooks/useSatelliteFacts'
import type { DiscosObject, Reentry } from '@/schemas/spaceTrack'

import { SatFacts } from './SatFacts'
import type { SatInfo } from './three/OrreryRenderer'

interface SatFactsLiveProps {
  info: SatInfo
  simMs: number
  physical: DiscosObject | null
  reentry: Reentry | null
}

/** SatFacts with the satellite's Space-Track catalogue entry fetched by its shard (#101). */
export function SatFactsLive({ info, simMs, physical, reentry }: SatFactsLiveProps) {
  const catalog = useSatcatEntry(info.noradId)
  return (
    <SatFacts info={info} simMs={simMs} catalog={catalog} physical={physical} reentry={reentry} />
  )
}
