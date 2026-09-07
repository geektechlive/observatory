import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useImageBucket } from '@/hooks/useImageBucket'

describe('useImageBucket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns the current bucket for the given refresh interval', () => {
    const refreshMs = 10 * 60 * 1000
    const { result } = renderHook(() => useImageBucket(refreshMs))
    expect(result.current).toBe(Math.floor(Date.now() / refreshMs))
  })

  it('advances the bucket once refreshMs has elapsed', () => {
    const refreshMs = 10 * 60 * 1000
    const { result } = renderHook(() => useImageBucket(refreshMs))
    const initial = result.current

    act(() => {
      vi.advanceTimersByTime(refreshMs)
    })

    expect(result.current).toBe(initial + 1)
  })

  it('does not advance the bucket while the tab is hidden', () => {
    const refreshMs = 10 * 60 * 1000
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

    const { result } = renderHook(() => useImageBucket(refreshMs))
    const initial = result.current

    act(() => {
      vi.advanceTimersByTime(refreshMs)
    })

    expect(result.current).toBe(initial)
  })

  it('resumes advancing once the tab becomes visible again', () => {
    const refreshMs = 10 * 60 * 1000
    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    visibility.mockReturnValue('hidden')

    const { result } = renderHook(() => useImageBucket(refreshMs))
    const initial = result.current

    act(() => {
      vi.advanceTimersByTime(refreshMs)
    })
    expect(result.current).toBe(initial)

    visibility.mockReturnValue('visible')
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current).toBe(initial + 1)
  })

  it('re-evaluates on a 60s tick regardless of refreshMs size', () => {
    const refreshMs = 60_000
    const { result } = renderHook(() => useImageBucket(refreshMs))
    const initial = result.current

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(result.current).toBe(initial + 1)
  })
})
