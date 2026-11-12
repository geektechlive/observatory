import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FIRST_FILL_DEADLINE_MS, useFirstFillReady } from '@/components/ticker/useFirstFillReady'

const spaceTrack = vi.hoisted(() => ({ isPending: true, isError: false }))

vi.mock('@/hooks/useSpaceTrack', () => ({
  useSpaceTrack: () => spaceTrack,
}))

describe('the ticker first fill (#175)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    spaceTrack.isPending = true
    spaceTrack.isError = false
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('waits for Space-Track, then gives up at the deadline', () => {
    const { result } = renderHook(() => useFirstFillReady(false))
    expect(result.current).toBe(false)
    act(() => {
      vi.advanceTimersByTime(FIRST_FILL_DEADLINE_MS - 1)
    })
    expect(result.current).toBe(false)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe(true)
  })

  it('fills straight away when Space-Track has already failed', () => {
    spaceTrack.isPending = false
    spaceTrack.isError = true
    const { result } = renderHook(() => useFirstFillReady(false))
    expect(result.current).toBe(true)
  })

  it('fills as soon as Space-Track answers', () => {
    const { result, rerender } = renderHook(() => useFirstFillReady(false))
    expect(result.current).toBe(false)
    spaceTrack.isPending = false
    rerender()
    expect(result.current).toBe(true)
  })

  it('clears its timer on unmount', () => {
    const { unmount } = renderHook(() => useFirstFillReady(false))
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  // A still strip shows only 8 items, so re-entries must make the first fill (review).
  it('with reduced motion, waits for Space-Track with no deadline', () => {
    const { result } = renderHook(() => useFirstFillReady(true))
    act(() => {
      vi.advanceTimersByTime(FIRST_FILL_DEADLINE_MS * 10)
    })
    expect(result.current).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
