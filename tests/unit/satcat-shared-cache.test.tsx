/**
 * The satellite browser and the inspector share one cache of SATCAT shards (#161), so a
 * shard the inspector already has is not downloaded again.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAllSatcat } from '@/components/orrery/useAllSatcat'
import { useSatcatEntry } from '@/hooks/useSatelliteFacts'
import { SATCAT_SHARDS, satcatShardOf } from '@/lib/spacetrack'

const fetchSatcatShard = vi.fn()
vi.mock('@/lib/api/spaceTrack', () => ({
  fetchSatcatShard: (shard: number) => fetchSatcatShard(shard) as Promise<unknown>,
  fetchDiscosEnvelope: vi.fn(),
}))

const ISS = '25544'
const WANTED = [ISS]
const SIX_MINUTES = 6 * 60 * 1000

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

beforeEach(() => {
  fetchSatcatShard.mockReset()
  fetchSatcatShard.mockImplementation((shard: number) =>
    Promise.resolve({
      generatedAt: 'x',
      citation: 'x',
      shard,
      rows:
        shard === satcatShardOf(ISS)
          ? [[ISS, '1998-067A', 'PAYLOAD', 'ISS', '1998-11-20', 'TTMTR', 'LARGE']]
          : [],
    }),
  )
})

describe('SATCAT shard cache (#161)', () => {
  it('does not download again a shard the inspector already has', async () => {
    const wrapper = wrapperFor(newClient())
    const inspector = renderHook(() => useSatcatEntry(ISS), { wrapper })
    await waitFor(() => {
      expect(inspector.result.current).not.toBeNull()
    })
    expect(fetchSatcatShard).toHaveBeenCalledTimes(1)

    const browser = renderHook(() => useAllSatcat(true, WANTED), { wrapper })
    await waitFor(() => {
      expect(browser.result.current.status).toBe('ready')
    })
    expect(fetchSatcatShard).toHaveBeenCalledTimes(SATCAT_SHARDS)
    expect(browser.result.current.satcat?.get(ISS)).toEqual({ country: 'ISS', rcs: 'LARGE' })
  })

  it('keeps the shards after the browser closes, past the default five minutes', async () => {
    vi.useFakeTimers()
    const client = newClient()
    const browser = renderHook(() => useAllSatcat(true, WANTED), { wrapper: wrapperFor(client) })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(browser.result.current.status).toBe('ready')

    browser.unmount()
    await vi.advanceTimersByTimeAsync(SIX_MINUTES)
    expect(client.getQueryData(['satcat', 0])).toBeDefined()
  })

  it('does not keep a failed shard, so a later load asks again', async () => {
    fetchSatcatShard.mockRejectedValue(new Error('503'))
    const wrapper = wrapperFor(newClient())
    const first = renderHook(() => useAllSatcat(true, WANTED), { wrapper })
    await waitFor(() => {
      expect(first.result.current.status).toBe('error')
    })
    first.unmount()
    fetchSatcatShard.mockClear()

    const second = renderHook(() => useAllSatcat(true, WANTED), { wrapper })
    await waitFor(() => {
      expect(second.result.current.status).toBe('error')
    })
    expect(fetchSatcatShard).toHaveBeenCalled()
  })
})
