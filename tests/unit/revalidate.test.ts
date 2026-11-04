import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { refetchOnceAfter, REVALIDATE_REFETCH_MS } from '@/lib/api/revalidate'

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
