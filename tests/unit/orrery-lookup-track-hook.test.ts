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
import type { SampledSpan } from '@/schemas/orreryBodies'
import type { OrreryApproach } from '@/schemas/orreryNeo'

import vq11Pass from './fixtures/jpl-lookup/vq11-pass.json'

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

function setup(simMs = NOW, approaches: readonly OrreryApproach[] = []) {
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
        approaches,
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

  it('stops asking after five retries, then offers to try again (#141 review)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      fetchSpan.mockResolvedValue({ state: 'unavailable', reason: 'busy', retryAfterS: 5 })
      const { result } = setup()
      act(() => {
        useLookupStore.getState().show(apophis)
      })
      await waitFor(() => {
        expect(fetchSpan).toHaveBeenCalledTimes(1)
      })
      for (let k = 0; k < 8; k += 1) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(6_000)
        })
      }
      // The first ask and five retries; then it waits for the visitor.
      expect(fetchSpan).toHaveBeenCalledTimes(6)
      expect(result.current.gaveUp).toBe(true)
      expect(result.current.problem).toBe('JPL is still busy. Try again in a minute.')
      await act(async () => {
        result.current.retry()
        await vi.advanceTimersByTimeAsync(10)
      })
      expect(fetchSpan).toHaveBeenCalledTimes(7)
    } finally {
      vi.useRealTimers()
    }
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

  it('showing it again after removing it opens the inspector again (#188)', async () => {
    fetchSpan.mockImplementation(async (_id, span) => ({ state: 'ok', data: answer(span) }))
    const { renderer, select } = setup()
    act(() => {
      useLookupStore.getState().show(apophis)
    })
    await waitFor(() => {
      expect(select).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(renderer.focusOn).toHaveBeenCalledTimes(1)
    })
    act(() => {
      useLookupStore.getState().clear()
    })
    act(() => {
      useLookupStore.getState().show(apophis)
    })
    await waitFor(() => {
      expect(select).toHaveBeenCalledTimes(2)
    })
    expect(select).toHaveBeenLastCalledWith('lookup:20099942')
  })
})

describe('useLookupTrack: a close pass gets a dense span (#215)', () => {
  const vq11: LookupObject = {
    id: 'sb:54670410',
    spkid: '54670410',
    name: '(2026 VQ11)',
    designation: '2026 VQ11',
    prefix: null,
    kind: 'asteroid',
    orbitClass: { code: 'APO', name: 'Apollo' },
    neo: true,
    pha: false,
  }
  const SIM = Date.parse('2026-11-11T15:00:00Z')
  const coarse = vq11Pass.coarse
  const dense = vq11Pass.dense
  const DENSE = { start: '2026-11-10', end: '2026-11-14', step: '10m' }
  const reply = (span: { start: string; end: string; step: string }, fine: SampledSpan) => ({
    state: 'ok' as const,
    data: {
      ...answer(span),
      object: vq11,
      target: '(2026 VQ11)',
      request: { start: span.start, end: span.end, stepMinutes: span.step === '10m' ? 10 : 2880 },
      fine,
    },
  })
  type Drawn = { closest: SampledSpan | null } | null
  const lastDrawn = (r: { setLookup: ReturnType<typeof vi.fn> }) =>
    r.setLookup.mock.lastCall?.[0] as Drawn
  const denseCalls = () => fetchSpan.mock.calls.filter(([, s]) => s.step === '10m')

  it('asks once for four days at 10 minutes around the pass, and draws from them', async () => {
    fetchSpan.mockImplementation(async (_id, span) =>
      reply(span, span.step === '10m' ? dense : coarse),
    )
    const { renderer, result, rerender } = setup(SIM)
    act(() => {
      useLookupStore.getState().show(vq11)
    })
    await waitFor(() => {
      expect(lastDrawn(renderer)?.closest).toEqual(dense)
    })
    expect(denseCalls()).toEqual([['sb:54670410', DENSE]])
    // A later date inside the same span asks for nothing more.
    rerender({ sim: SIM + 3_600_000 })
    expect(denseCalls()).toHaveLength(1)
    expect(result.current.problem).toBeNull()
  })

  it('shows nothing extra while it loads or when it fails: the 2-day line stays', async () => {
    fetchSpan.mockImplementation(async (_id, span) =>
      span.step === '10m'
        ? { state: 'unavailable', reason: 'busy', retryAfterS: 20 }
        : reply(span, coarse),
    )
    const { renderer, result } = setup(SIM)
    act(() => {
      useLookupStore.getState().show(vq11)
    })
    await waitFor(() => {
      expect(denseCalls()).toHaveLength(1)
    })
    const drawn = lastDrawn(renderer)
    expect(drawn).not.toBeNull()
    expect(drawn?.closest).toBeNull()
    expect(result.current.problem).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.gaveUp).toBe(false)
  })

  it('asks nothing when the close approaches already draw this pass (#216)', async () => {
    fetchSpan.mockImplementation(async (_id, span) => reply(span, coarse))
    const twin = {
      id: 'sb:2026 VQ11',
      des: '2026 VQ11',
      closeApproach: { jd: vq11Pass.cadJd },
      fine: coarse,
      close: null,
      closest: null,
    } as unknown as OrreryApproach
    const { renderer } = setup(SIM, [twin])
    act(() => {
      useLookupStore.getState().show(vq11)
    })
    await waitFor(() => {
      expect(lastDrawn(renderer)).not.toBeNull()
    })
    expect(denseCalls()).toHaveLength(0)
  })

  it('waits for the close approaches before asking, so a twin found late costs nothing', async () => {
    fetchSpan.mockImplementation(async (_id, span) => reply(span, coarse))
    const twin = {
      id: 'sb:2026 VQ11',
      des: '2026 VQ11',
      closeApproach: { jd: vq11Pass.cadJd },
      fine: coarse,
      close: null,
      closest: null,
    } as unknown as OrreryApproach
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children)
    const renderer = { setLookup: vi.fn(), focusOn: vi.fn() }
    const hook = renderHook(
      ({ approaches, settled }: { approaches: OrreryApproach[]; settled: boolean }) =>
        useLookupTrack({
          renderer,
          simMs: SIM,
          select: vi.fn(),
          approaches,
          approachesSettled: settled,
        }),
      { wrapper, initialProps: { approaches: [] as OrreryApproach[], settled: false } },
    )
    act(() => {
      useLookupStore.getState().show(vq11)
    })
    await waitFor(() => {
      expect(lastDrawn(renderer)).not.toBeNull()
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(denseCalls()).toHaveLength(0)
    hook.rerender({ approaches: [twin], settled: true })
    await new Promise((r) => setTimeout(r, 50))
    expect(denseCalls()).toHaveLength(0)
  })

  it('asks nothing for an object that never comes near Earth', async () => {
    fetchSpan.mockImplementation(async (_id, span) => ({ state: 'ok', data: answer(span) }))
    const { renderer } = setup(SIM)
    act(() => {
      useLookupStore.getState().show(apophis)
    })
    await waitFor(() => {
      expect(lastDrawn(renderer)).not.toBeNull()
    })
    expect(denseCalls()).toHaveLength(0)
  })
})
