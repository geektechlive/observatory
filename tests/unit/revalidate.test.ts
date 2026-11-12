import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { refetchOnceAfter, REVALIDATE_REFETCH_MS, revalidateFeeds } from '@/lib/api/revalidate'

describe('refetchOnceAfter (#83)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits for the server refresh to land before asking again', () => {
    const refetch = vi.fn()
    const notify = refetchOnceAfter(refetch)
    notify()
    vi.advanceTimersByTime(REVALIDATE_REFETCH_MS - 1)
    expect(refetch).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('asks once for a burst of old answers, as on a cold page load', () => {
    const refetch = vi.fn()
    const notify = refetchOnceAfter(refetch)
    notify()
    notify()
    notify()
    vi.advanceTimersByTime(REVALIDATE_REFETCH_MS)
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('can ask again for a later old answer', () => {
    const refetch = vi.fn()
    const notify = refetchOnceAfter(refetch)
    notify()
    vi.advanceTimersByTime(REVALIDATE_REFETCH_MS)
    notify()
    vi.advanceTimersByTime(REVALIDATE_REFETCH_MS)
    expect(refetch).toHaveBeenCalledTimes(2)
  })

  it('gives the server longer than its 8 s upstream deadline', () => {
    expect(REVALIDATE_REFETCH_MS).toBeGreaterThan(8_000)
  })
})

describe('revalidateFeeds (#215)', () => {
  it('refetches the active feeds but never an on-demand JPL lookup', async () => {
    const client = new QueryClient()
    const feed = vi.fn(async () => 1)
    const jpl = vi.fn(async () => 2)
    const keys = [
      ['jpl-lookup', 'q'],
      ['jpl-lookup-track', '1', 'a', 'b'],
      ['jpl-lookup-closest', '1'],
    ]
    const observers = [
      new QueryObserver(client, { queryKey: ['neo'], queryFn: feed, staleTime: Infinity }),
      ...keys.map(
        (queryKey) => new QueryObserver(client, { queryKey, queryFn: jpl, staleTime: Infinity }),
      ),
    ]
    const stop = observers.map((o) => o.subscribe(() => undefined))
    await vi.waitFor(() => {
      expect(jpl).toHaveBeenCalledTimes(3)
    })
    expect(feed).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(client.isFetching()).toBe(0)
    })
    await revalidateFeeds(client)
    expect(client.getQueryState(['neo'])?.dataUpdateCount).toBe(2)
    expect(feed).toHaveBeenCalledTimes(2)
    // Each lookup spends the JPL queue's daily budget: asked once, never re-asked here.
    expect(jpl).toHaveBeenCalledTimes(3)
    for (const s of stop) s()
  })
})
