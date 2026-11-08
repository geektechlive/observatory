import { useEffect, useMemo, useState } from 'react'

import { fetchSatcatShard } from '@/lib/api/spaceTrack'
import type { SatcatLite } from '@/lib/orrery/satBrowse'
import { SATCAT_SHARDS } from '@/lib/spacetrack'
import type { SatcatShard } from '@/schemas/spaceTrack'

const SHARDS = Array.from({ length: SATCAT_SHARDS }, (_, i) => i)

export type SatcatStatus = 'idle' | 'loading' | 'ready' | 'error'

type Loaded =
  | { status: 'idle' | 'loading' | 'error' }
  | { status: 'ready'; rows: readonly SatcatShard['rows'][] }

/**
 * Shards already asked for, kept for the page's life: closing and reopening the browser
 * does not download them again. A failed one is dropped so a later tap retries.
 */
const shardCache = new Map<number, Promise<SatcatShard>>()

function shard(n: number): Promise<SatcatShard> {
  const had = shardCache.get(n)
  if (had) return had
  const asked = fetchSatcatShard(n)
  shardCache.set(n, asked)
  asked.catch(() => {
    shardCache.delete(n)
  })
  return asked
}

/** For tests: forget the shards fetched so far. */
export function resetSatcatCache(): void {
  shardCache.clear()
}

/**
 * Space-Track's whole SATCAT for the satellite browser (#158): all 16 shards, fetched
 * only once `enabled` (the visitor asked). Keeps just the owner and radar size of the ids
 * in `wanted`.
 *
 * It uses the plain fetcher and its own small cache rather than `useQueries`, which added
 * 1.4 kB gzip to the orrery chunk (measured in this change). The inspector's one-shard
 * lookup (useSatcatEntry) keeps its own query cache, so a shard may be fetched once by
 * each.
 */
export function useAllSatcat(
  enabled: boolean,
  wanted: readonly string[],
): { status: SatcatStatus; satcat: SatcatLite | undefined } {
  const [loaded, setLoaded] = useState<Loaded>({ status: 'idle' })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    Promise.all(SHARDS.map(shard)).then(
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
  }, [enabled])

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
