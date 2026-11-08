import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api/jplLookup', async (importOriginal) => {
  const real: object = await importOriginal()
  return { ...real, fetchTrajectorySpan: vi.fn() }
})

import { useLookupStore } from '@/components/orrery/lookupStore'
import { useLookupTrack } from '@/components/orrery/useLookupTrack'
import { fetchTrajectorySpan } from '@/lib/api/jplLookup'
import { lookupSpan } from '@/lib/orrery/lookupTrack'
import type { LookupObject, TrajectoryResponse } from '@/schemas/jplLookup'

const fetchSpan = vi.mocked(fetchTrajectorySpan)

const apophis: LookupObject = {
  id: 'sb:20099942',
  spkid: '20099942',
  name: '99942 Apophis (2004 MN4)',
  designation: '99942',
  prefix: null,
  kind: 'asteroid',
  orbitClass: { code: 'ATE', name: 'Aten' },
  neo: true,
  pha: true,
}

const DAY_MS = 86_400_000
const NOW = Date.parse('2026-11-07T12:00:00Z')
const jdOf = (ms: number) => ms / DAY_MS + 2440587.5

/** A trajectory answer whose samples cover the span asked for (a circle at 1 au). */
function answer(span: { start: string; end: string }): TrajectoryResponse {
  const start = jdOf(Date.parse(`${span.start}T00:00:00Z`))
  const n =
    (Date.parse(`${span.end}T00:00:00Z`) - Date.parse(`${span.start}T00:00:00Z`)) / (2 * DAY_MS) + 1
  const w = 0.01720209895
  const samples: number[] = []
  for (let i = 0; i < n; i += 1) {
    const th = w * 2 * i
    samples.push(Math.cos(th), Math.sin(th), 0, -w * Math.sin(th), w * Math.cos(th), 0)
  }
  return {
    generatedAt: '2026-11-07T00:00:00Z',
    frame: 'ecliptic-J2000',
    center: 'Sun',
    timeScale: 'TDB',
    units: { position: 'au', velocity: 'au/day' },
    sourceType: 'ephemeris',
    provider: 'jpl-horizons',
    object: apophis,
    target: '99942 Apophis (2004 MN4)',
    request: { start: span.start, end: span.end, stepMinutes: 2880 },
    fine: { start, step: 2, samples },
    availableFrom: null,
    availableTo: null,
  }
}

function setup(simMs = NOW) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  const renderer = { setLookup: vi.fn(), focusOn: vi.fn() }
  const select = vi.fn()
  const hook = renderHook(
    ({ sim }) =>
      useLookupTrack({
        renderer,
        simMs: sim,
        select,
      }),
    { wrapper, initialProps: { sim: simMs } },
  )
  return { ...hook, renderer, select }
}

afterEach(() => {
  cleanup()
  act(() => {
    useLookupStore.getState().clear()
  })
  vi.clearAllMocks()
})

describe('useLookupTrack (#145)', () => {
  it('asks for nothing and draws nothing until an object is shown', () => {
    const { renderer } = setup()
    expect(fetchSpan).not.toHaveBeenCalled()
    expect(renderer.setLookup).toHaveBeenLastCalledWith(null)
  })

  it('"Show in orrery" fetches its span, draws it, then flies to it once', async () => {
    fetchSpan.mockImplementation(async (_id, span) => ({ state: 'ok', data: answer(span) }))
    const { renderer, select, result } = setup()
    act(() => {
      useLookupStore.getState().show(apophis)
    })
    const span = lookupSpan(NOW)
    await waitFor(() => {
      expect(fetchSpan).toHaveBeenCalledWith('sb:20099942', span)
    })
    await waitFor(() => {
      expect(select).toHaveBeenCalledWith('lookup:20099942')
    })
    expect(select).toHaveBeenCalledTimes(1)
    const drawn = renderer.setLookup.mock.lastCall?.[0] as { key: string; label: string } | null
    expect(drawn?.key).toBe('lookup:20099942')
    expect(drawn?.label).toBe('Apophis')
    expect(result.current.label).toBe('Apophis')
    expect(result.current.item).toMatchObject({
      key: 'lookup:20099942',
      label: '99942 Apophis (2004 MN4)',
      kind: 'lookup',
      available: true,
    })
    expect(useLookupStore.getState().shown?.focusOnLoad).toBe(false)
  })

  it('a link asks by SPK-ID and names it from the answer, without flying to it itself', async () => {
    fetchSpan.mockImplementation(async (_id, span) => ({ state: 'ok', data: answer(span) }))
    const { select, result } = setup()
    act(() => {
      useLookupStore.getState().request('20099942')
    })
    await waitFor(() => {
      expect(result.current.item?.label).toBe('99942 Apophis (2004 MN4)')
    })
    expect(select).not.toHaveBeenCalled()
  })

  it('needs no new request while the clock stays inside the span; past it, one after a pause', async () => {
    fetchSpan.mockImplementation(async (_id, span) => ({ state: 'ok', data: answer(span) }))
    const { rerender } = setup()
    act(() => {
      useLookupStore.getState().show(apophis)
    })
    await waitFor(() => {
      expect(fetchSpan).toHaveBeenCalledTimes(1)
    })
    rerender({ sim: NOW + 30 * DAY_MS })
    rerender({ sim: NOW + 60 * DAY_MS })
    expect(fetchSpan).toHaveBeenCalledTimes(1)
    // A scrub of years passes through many spans: only where it settles is asked for.
    rerender({ sim: NOW + 400 * DAY_MS })
    rerender({ sim: NOW + 800 * DAY_MS })
    expect(fetchSpan).toHaveBeenCalledTimes(1)
    await waitFor(
      () => {
        expect(fetchSpan).toHaveBeenCalledTimes(2)
      },
      { timeout: 3000 },
    )
    expect(fetchSpan).toHaveBeenLastCalledWith('sb:20099942', lookupSpan(NOW + 800 * DAY_MS))
  })

  it('opens the inspector at once, and flies there when the samples arrive', async () => {
    let resolve: (v: Awaited<ReturnType<typeof fetchTrajectorySpan>>) => void = () => undefined
    fetchSpan.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    const { renderer, select } = setup()
    act(() => {
      useLookupStore.getState().show(apophis)
    })
    await waitFor(() => {
      expect(select).toHaveBeenCalledWith('lookup:20099942')
    })
    expect(renderer.focusOn).not.toHaveBeenCalled()
    const span = lookupSpan(NOW)
    if (!span) throw new Error('no span')
    await waitFor(() => {
      expect(fetchSpan).toHaveBeenCalled()
    })
    act(() => {
      resolve({ state: 'ok', data: answer(span) })
    })
    await waitFor(() => {
      expect(renderer.focusOn).toHaveBeenCalledWith('lookup:20099942')
    })
    expect(select).toHaveBeenCalledTimes(1)
    expect(useLookupStore.getState().shown?.focusOnLoad).toBe(false)
  })

  it('says a busy queue in plain words and how long it asked to wait', async () => {
    fetchSpan.mockResolvedValue({ state: 'unavailable', reason: 'busy', retryAfterS: 20 })
    const { result } = setup()
    act(() => {
      useLookupStore.getState().show(apophis)
    })
    await waitFor(() => {
      expect(result.current.problem).toBe('JPL is busy right now. Trying again in 20 s.')
    })
  })

  it('removing it takes it out of the scene', async () => {
    fetchSpan.mockImplementation(async (_id, span) => ({ state: 'ok', data: answer(span) }))
    const { renderer } = setup()
    act(() => {
      useLookupStore.getState().show(apophis)
    })
    await waitFor(() => {
      expect(renderer.setLookup).toHaveBeenLastCalledWith(
        expect.objectContaining({ key: 'lookup:20099942' }),
      )
    })
    act(() => {
      useLookupStore.getState().clear()
    })
    expect(renderer.setLookup).toHaveBeenLastCalledWith(null)
  })
})
