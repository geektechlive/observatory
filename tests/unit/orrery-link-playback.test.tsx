/**
 * The address during playback (#246): it was written only when the clock store changed, so
 * a link copied mid-play carried the moment Play was pressed. While playing it is now
 * rewritten every few seconds (replaceState, never per frame).
 */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { OrreryRenderer } from '@/components/orrery/three/OrreryRenderer'
import { useOrreryLink } from '@/components/orrery/useOrreryLink'
import { useOrreryClock } from '@/store/orreryClock'
import { useOrreryView } from '@/store/orreryView'

const RENDERER = {} as unknown as OrreryRenderer
const T0 = Date.parse('2026-11-14T00:00:00Z')

function mount() {
  return renderHook(() => {
    const selected = useOrreryView((s) => s.selected)
    const preset = useOrreryView((s) => s.preset)
    return useOrreryLink({
      renderer: RENDERER,
      catalog: [{ key: 'Mars', label: 'Mars' }],
      settled: true,
      selected,
      preset,
      select: useOrreryView.getState().setSelected,
      applyPreset: useOrreryView.getState().setPreset,
      requestLookup: vi.fn(),
      lookupFailed: false,
      sats: {
        has: () => false,
        settled: true,
        allOn: true,
        version: 0,
        openOrbit: vi.fn(),
        widen: vi.fn(),
        restore: vi.fn(),
      },
      clearSelection: () => {
        useOrreryView.getState().setSelected(null)
      },
      hasModel: () => false,
    })
  })
}

const linkTime = () => /[#&]t=([^&]*)/.exec(window.location.hash)?.[1] ?? null

beforeEach(() => {
  vi.useFakeTimers({ now: T0 + 3_600_000 })
  window.history.replaceState(null, '', '/orrery/')
  useOrreryView.setState({ selected: null, preset: null, detail: null })
  useOrreryClock.getState().pause()
  useOrreryClock.getState().setSimTime(T0)
})
afterEach(() => {
  cleanup()
  useOrreryClock.getState().pause()
  vi.useRealTimers()
})

describe('the address during playback (#246)', () => {
  it('keeps up while the clock plays, not stuck at the moment Play was pressed', () => {
    mount()
    act(() => {
      useOrreryClock.getState().setRate(86_400)
      useOrreryClock.getState().play()
    })
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    const atStart = linkTime()
    expect(atStart).not.toBeNull()
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    // Ten seconds at a day a second: the address has moved on by days.
    expect(linkTime()).not.toBe(atStart)
  })
})
