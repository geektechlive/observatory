import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { parseDsn, type DsnData } from '@/lib/dsn'
import { useUiStore } from '@/store/ui'

// NASA DSN Now feed — open CORS, polled directly (as NASA's own widget does).
const DSN_URL = 'https://eyes.nasa.gov/dsn/data/dsn.xml'

async function fetchDsn(): Promise<DsnData> {
  const res = await fetch(`${DSN_URL}?t=${Math.floor(Date.now() / 15000)}`)
  if (!res.ok) throw new Error(`DSN fetch failed: ${res.status}`)
  return parseDsn(await res.text())
}

export function useDsn() {
  const query = useQuery({
    queryKey: ['dsn'],
    queryFn: fetchDsn,
    staleTime: 15 * 1000,
    refetchInterval: 15 * 1000,
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    useUiStore.getState().setSourceError('dsn', query.error != null)
  }, [query.error])

  return query
}
