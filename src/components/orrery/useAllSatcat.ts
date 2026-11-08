import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'

import { fetchSatcatShard } from '@/lib/api/spaceTrack'
import type { SatcatLite } from '@/lib/orrery/satBrowse'
import { SATCAT_SHARDS } from '@/lib/spacetrack'

const SIX_HOURS = 6 * 60 * 60 * 1000
const SHARDS = Array.from({ length: SATCAT_SHARDS }, (_, i) => i)

export type SatcatStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Space-Track's whole SATCAT for the satellite browser (#158): all 16 shards, fetched
 * only once `enabled` (the visitor asked), under the same query keys the inspector's
 * one-shard lookup uses, so a shard is never downloaded twice. Keeps just the owner and
 * radar size of the ids in `wanted`.
 */
export function useAllSatcat(
  enabled: boolean,
  wanted: readonly string[],
): { status: SatcatStatus; satcat: SatcatLite | undefined } {
  const combined = useQueries({
    queries: SHARDS.map((shard) => ({
      queryKey: ['satcat', shard],
      queryFn: () => fetchSatcatShard(shard),
      enabled,
      staleTime: SIX_HOURS,
      refetchOnWindowFocus: false,
      retry: false,
    })),
    combine: (results) => ({
      ready: results.every((r) => r.isSuccess),
      failed: results.some((r) => r.isError),
      rows: results.map((r) => r.data?.rows),
    }),
  })
  const { ready, failed, rows } = combined
  const satcat = useMemo(() => {
    if (!ready) return undefined
    const want = new Set(wanted)
    const out = new Map<string, { country: string; rcs: string }>()
    for (const shard of rows) {
      for (const row of shard ?? []) {
        if (want.has(row[0])) out.set(row[0], { country: row[3], rcs: row[6] })
      }
    }
    return out
  }, [ready, rows, wanted])
  const status: SatcatStatus = ready ? 'ready' : !enabled ? 'idle' : failed ? 'error' : 'loading'
  return { status, satcat }
}
