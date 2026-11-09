import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

import { satcatShardQuery } from '@/hooks/useSatelliteFacts'
import type { SatcatLite } from '@/lib/orrery/satBrowse'
import { SATCAT_SHARDS } from '@/lib/spacetrack'
import type { SatcatShard } from '@/schemas/spaceTrack'

const SHARDS = Array.from({ length: SATCAT_SHARDS }, (_, i) => i)

export type SatcatStatus = 'idle' | 'loading' | 'ready' | 'error'

type Loaded =
  | { status: 'idle' | 'loading' | 'error' }
  | { status: 'ready'; rows: readonly SatcatShard['rows'][] }

/**
 * Space-Track's whole SATCAT for the satellite browser (#158): all 16 shards, fetched
 * only once `enabled` (the visitor asked). Keeps just the owner and radar size of the ids
 * in `wanted`.
 *
 * It calls `query` on the query client rather than `useQueries`, which added 1.4 kB
 * gzip to the orrery chunk (#158). The client is the one cache the inspector's one-shard
 * lookup also uses (#161); it keeps no failed shard, so a later load asks again.
 */
export function useAllSatcat(
  enabled: boolean,
  wanted: readonly string[],
): { status: SatcatStatus; satcat: SatcatLite | undefined } {
  const client = useQueryClient()
  const [loaded, setLoaded] = useState<Loaded>({ status: 'idle' })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    Promise.all(SHARDS.map((n) => client.query(satcatShardQuery(n)))).then(
      (shards) => {
        if (!cancelled) setLoaded({ status: 'ready', rows: shards.map((s) => s.rows) })
      },
      () => {
        if (!cancelled) setLoaded({ status: 'error' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [client, enabled])

  const rows = loaded.status === 'ready' ? loaded.rows : null
  const satcat = useMemo(() => {
    if (!rows) return undefined
    const want = new Set(wanted)
    const out = new Map<string, { country: string; rcs: string }>()
    for (const s of rows) {
      for (const row of s) {
        if (want.has(row[0])) out.set(row[0], { country: row[3], rcs: row[6] })
      }
    }
    return out
  }, [rows, wanted])
  const status: SatcatStatus = loaded.status === 'idle' && enabled ? 'loading' : loaded.status
  return { status, satcat }
}
